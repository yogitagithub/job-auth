const mongoose = require("mongoose");


const workSchema = new mongoose.Schema(
  {
    companyName: { type: String, trim: true },
    jobTitle: { type: String, trim: true },
    sessionFrom: { type: Date },
    sessionTo: { type: Date },
    roleDescription: { type: String, trim: true },
  
  }
  
);


const workExperienceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    jobSeekerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeekerProfile",
      required: true,
    },
    workExperiences: {
      type: [workSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WorkExperience", workExperienceSchema);
