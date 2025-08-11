const mongoose = require("mongoose");

const skillSchema = new mongoose.Schema(
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
    skills: {
      type: String,
      trim: true,
    },

     isDeleted: { 
    type: Boolean, 
    default: false 
  }
  
  },
  { timestamps: true }
);

module.exports = mongoose.model("Skill", skillSchema);

