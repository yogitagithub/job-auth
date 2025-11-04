const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
   
    
    jobApplicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobApplication",
      required: true,
    },

     employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyProfile",
      required: true,
    },

    jobSeekerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeekerProfile",
      required: true,
    },

     totalHours: {
      type: Number,
      required: true,
      default: 0,
    },

    
    totalAmount: {
      type: Number,
      required: true,
      default: 0,
    },

     isDeleted: {
      type: Boolean,
      default: false,
    }

  
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);



