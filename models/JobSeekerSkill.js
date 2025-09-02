const mongoose = require("mongoose");

const jobSeekerSkillSchema = new mongoose.Schema(
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

    skillIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Skill",
      }
    ],

    
  isDeleted: {
    type: Boolean,
    default: false
  }


      },
  { timestamps: true }
);

module.exports = mongoose.model("JobSeekerSkill", jobSeekerSkillSchema);