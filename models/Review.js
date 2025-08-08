const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    userId: { // Reviewer
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reviewFor: {
      type: String,
      enum: ["employer", "job_seeker"],
      required: true,
    },
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyProfile", // For job seekers reviewing employers
    },
    jobSeekerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeekerProfile", // For employers reviewing job seekers
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    comment: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Review", reviewSchema);
