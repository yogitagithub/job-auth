const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema(
  {
     userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
         unique: true,
        required: true
      },
      phoneNumber: {
        type: String,
        required: true
      },
    name: {
      type: String,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
     
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
    
    },
   
    email: {
      type: String,
     
      lowercase: true,
      trim: true,
    },
    industry: {
      type: String,
    
    },
     panCardNumber: { type: String, trim: true },
      alternatePhoneNumber: { type: String },
    jobProfile: {
      type: String,
     
    },
    address: {
      type: String,
     
    },
    state: {
      type: String,
     
    },
    city: {
      type: String,
     
    },
    pincode: {
      type: String,
     
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("JobSeekerProfile", profileSchema);
