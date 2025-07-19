const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phoneNumber: {
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
      enum: ['job_seeker', 'employer', 'admin'],
    default: null
  },
  token: {
    type: String,
    default: null
  }
});

module.exports = mongoose.model('User', userSchema);
