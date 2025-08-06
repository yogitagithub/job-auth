const mongoose = require("mongoose");

const workExperienceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    jobSeekerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeekerProfile",
      required: true,
    },
    companyName: { type: String, trim: true, default: null },
    jobTitle: { type: String, trim: true, default: null },
    sessionFrom: { type: Date, default: null },
    sessionTo: { type: Date, default: null },
    roleDescription: { type: String, trim: true, default: null },

     isDeleted: { 
    type: Boolean, 
    default: false 
  }
  
  },
  { timestamps: true }
);

module.exports = mongoose.model("WorkExperience", workExperienceSchema);



