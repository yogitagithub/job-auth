const mongoose = require("mongoose");

const bankDetailsSchema = new mongoose.Schema(
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


    accountHolderName: { type: String, trim: true, default: null },
    accountNumber: { type: String, trim: true, default: null },
    ifscCode: { type: Date, default: null },
    branchName: { type: String, default: null },
    accountType: { type: String, trim: true, default: null },

     isDeleted: { 
    type: Boolean, 
    default: false 
  }
  
  },
  { timestamps: true }
);

module.exports = mongoose.model("BankDetails", bankDetailsSchema);



