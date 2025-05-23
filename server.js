require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const User = require('./models/User');
const Data = require('./models/Data');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

const SECRET = process.env.JWT_SECRET || 'fallback-secret';
let latestData = { temperature: "--", humidity: "--", bulb: "OFF" };

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ Connected to MongoDB Atlas"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/register.html'));
});

// Register route
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: "Username already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ username, password: hashedPassword });

    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ username }, SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Route to receive sensor data
app.post('/data', async (req, res) => {
  latestData = req.body;
  console.log("📥 Received data:", latestData);

  await Data.create(latestData); // Save to MongoDB
  io.emit("update", latestData); // Send to all WebSocket clients
  res.sendStatus(200);
});

// 🔧 FIXED: Move this outside io.on(...)
app.get('/status', (req, res) => {
  res.send(latestData.bulb);
});

// WebSocket connection
io.on("connection", (socket) => {
  console.log("🔌 Client connected");
  socket.emit("update", latestData);

  socket.on("bulb-command", (status) => {
    latestData.bulb = status;
    io.emit("update", latestData);
  });
});

const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

let bulbStatus = 'OFF';

app.post('/command', (req, res) => {
  const command = req.body.command;
  if (command === 'ON' || command === 'OFF') {
    bulbStatus = command;
    console.log(`Received command: ${bulbStatus}`);
    // TODO: Relay to ESP32 or internal logic
    res.status(200).send({ status: 'OK', bulb: bulbStatus });
  } else {
    res.status(400).send({ error: 'Invalid command' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
