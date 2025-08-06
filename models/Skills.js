// const mongoose = require("mongoose");

// const skillSchema = new mongoose.Schema(
//   {
//     userId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//       // unique: true,
//     },
//     jobSeekerId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "JobSeekerProfile",
//       required: true,
//     },
//     skills: {
//       type: [String],
//       validate: [arrayLimit, "{PATH} must have at least 4 skills"],
//     },
//   },
//   { timestamps: true }
// );


// function arrayLimit(val) {
//   return val.length >= 4;
// }

// module.exports = mongoose.model("Skill", skillSchema);




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

