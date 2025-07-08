const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  mobile: {
    type: String,
    required: true,
    unique: true
  },
   otp: {
    type: String
  },
  otpExpiresAt: {
    type: Date
  },
   role: {
    type: String,
    default: null
  },
  token: {
    type: String,
    default: null
  }
});

module.exports = mongoose.model('User', userSchema);
