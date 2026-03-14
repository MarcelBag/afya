const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  twoFactorCode: { type: String },
  twoFactorExpires: { type: Date },
  role: { 
    type: String, 
    enum: ['user', 'admin', 'superuser'], 
    default: 'user' 
  },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'suspended'], 
    default: 'active' 
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
