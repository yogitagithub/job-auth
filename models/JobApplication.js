 const mongoose = require("mongoose");

const jobApplicationSchema = new mongoose.Schema(
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
    jobPostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobPost",
      required: true,
    },
    // educationId: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "JobSeekerEducation",
    //   required: true,
    // },
    // experienceId: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "WorkExperience",
    //   required: true,
    // },
    // skillsId: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "Skill",
    //   required: true,
    // },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resume",
      required: true,
    },

   
    status: {
      type: String,
      enum: ["Applied", "Withdrawn"],
      default: "Applied",
    },
    

     employerApprovalStatus: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending"
    },

    

    appliedAt: {
      type: Date,
      default: Date.now,
    },

    
  },
  { timestamps: true }
);


jobApplicationSchema.index({ userId: 1, jobPostId: 1 }, { unique: true });

module.exports = mongoose.model("JobApplication", jobApplicationSchema);
