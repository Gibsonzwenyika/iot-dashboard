const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
  temperature: String,
  humidity: String,
  bulb: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Data', dataSchema);
