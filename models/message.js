const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  username: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }, // Change the type to Date
  read: { type: Boolean, default: false }, // Add read field with default value false
});

module.exports = mongoose.model('Message', messageSchema);
