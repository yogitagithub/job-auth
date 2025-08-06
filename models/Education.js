const mongoose = require("mongoose");

const jobSeekerEducationSchema = new mongoose.Schema(
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
    degree: { type: String, required: true, trim: true },
    boardOfUniversity: { type: String, required: true, trim: true },
    sessionFrom: { type: Date, required: true },
    sessionTo: { type: Date, required: true },
    marks: { type: String, trim: true },
    gradeOrPercentage: { type: String, trim: true },

     isDeleted: { 
    type: Boolean, 
    default: false 
  }
  
  },
  { timestamps: true }
);

module.exports = mongoose.model("JobSeekerEducation", jobSeekerEducationSchema);

