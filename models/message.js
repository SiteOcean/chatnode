const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  username: { type: String, required: true }, // Add the username field
});

// Use the model method directly on mongoose
module.exports = mongoose.model('Message', messageSchema);
