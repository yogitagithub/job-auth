const mongoose = require("mongoose");


const educationEntrySchema = new mongoose.Schema(
  {
    degree: { type: String, required: true, trim: true },
    boardOfUniversity: { type: String, required: true, trim: true },
    sessionFrom: { type: Date, required: true },
    sessionTo: { type: Date, required: true },
    marks: { type: String, trim: true },
    gradeOrPercentage: { type: String, trim: true },
  }
  
);


const jobSeekerEducationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      // unique: true,
    },
    jobSeekerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeekerProfile",
      required: true,
    },
    educations: {
      type: [educationEntrySchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("JobSeekerEducation", jobSeekerEducationSchema);
