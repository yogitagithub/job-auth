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

    
    


    skillsId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeekerSkill",
      required: true,
    },


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
      enum: ["Pending", "Approved", "Rejected", "Disconnected"],
      default: "Pending"
    },


     hourlyRate: {
      type: Number,
      default: null,
    },

    

    appliedAt: {
      type: Date,
      default: Date.now,
    },

     // NEW: default zeros (we’ll still compute live in the API)
    totalTask:         { type: Number, default: 0 },
    totalTaskApproved: { type: Number, default: 0 },
    taskHours:         { type: Number, default: 0 },

    
  },
  { timestamps: true }
);


jobApplicationSchema.index({ userId: 1, jobPostId: 1 }, { unique: true });

module.exports = mongoose.model("JobApplication", jobApplicationSchema);
