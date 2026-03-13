const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    unique: true,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  twoFactorCode: {
    type: String
  },
  twoFactorExpires: {
    type: Date
  }
});

module.exports = mongoose.model('User', userSchema);
