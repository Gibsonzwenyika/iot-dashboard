require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const User = require('./models/User');
const Data = require('./models/Data');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let latestData = { temperature: "--", humidity: "--", bulb: "OFF" };
let bulbStatus = "OFF";

// --- MongoDB connection ---
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ Connected to MongoDB Atlas"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// --- Serve HTML pages ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public/register.html')));

// --- User Registration ---
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    if (await User.findOne({ username })) return res.status(400).json({ error: "Username already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ username, password: hashedPassword });
    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// --- User Login ---
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    if (!(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ username }, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// --- ESP32 posts sensor data ---
app.post('/data', async (req, res) => {
  latestData = req.body;
  console.log("📥 Received data:", latestData);
  await Data.create(latestData);

  // Broadcast to all dashboards immediately
  io.emit('update', latestData);
  res.sendStatus(200);
});

// --- ESP32 polls bulb status ---
app.get('/bulb/status', (req, res) => {
  res.send(bulbStatus);
});

// --- Dashboard sends bulb command ---
app.post('/bulb/:state', (req, res) => {
  const state = req.params.state.toUpperCase();
  if (state === "ON" || state === "OFF") {
    bulbStatus = state;
    latestData.bulb = bulbStatus;
    console.log(`💡 Bulb set via HTTP POST: ${bulbStatus}`);

    // Broadcast updated data to all dashboards
    io.emit('update', latestData);
    res.json({ bulb: bulbStatus });
  } else {
    res.status(400).json({ error: "Invalid bulb state" });
  }
});

// --- Dashboard fetches latest sensor data (HTTP fallback) ---
app.get('/data', (req, res) => res.json(latestData));

// --- Socket.IO connection ---
io.on('connection', (socket) => {
  console.log('🔗 Dashboard connected');

  // Send current data immediately
  socket.emit('update', latestData);

  // Listen for bulb commands
  socket.on('bulb-command', (state) => {
    state = state.toUpperCase();
    if (state === "ON" || state === "OFF") {
      bulbStatus = state;
      latestData.bulb = bulbStatus;
      console.log(`💡 Bulb set via Socket.IO: ${bulbStatus}`);

      // Broadcast to all dashboards
      io.emit('update', latestData);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Dashboard disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
