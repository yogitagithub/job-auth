
const mongoose = require('mongoose');

const jobPostSchema = new mongoose.Schema(
  {
    userId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  required: true
},

    companyId: {
       type: mongoose.Schema.Types.ObjectId,
       ref: "CompanyProfile",
        // unique: true,
       required: true
    },
    category: {
      type: String,
      required: true,
      enum: ["Category A", "Category B", "Other"], // adjust categories as needed
    },
    industryType: {
      type: String,
      
    },

    // Step 2 fields
    jobTitle: {
      type: String,
     
      trim: true,
    },
    jobDescription: {
      type: String,
     
      trim: true,
    },
    salaryType: {
      type: String,
      enum: ["Hourly", "Monthly"],
     
    },
    displayPhoneNumber: {
      type: String,
      match: /^[0-9]{8,15}$/, // adjust regex as per your region
    
    },
    displayEmail: {
      type: String,
      match: /.+\@.+\..+/,
    
    },
    jobType: {
      type: String,
      enum: [
        "Hourly",
        "On-Site",
        "Full Time Remote",
        "Full Time On-Site",
      ],
    
    },
    skills: {
      type: [String],
      default: [],
    },
    salaryRange: {
      min: {
        type: Number,
       
      },
      max: {
        type: Number,
       
      },
    },
    state: {
      type: String,
     
    },
    experience: {
      type: String,
      enum: [
        "Fresher",
        "1 - 3 Years",
        "3 - 5 Years",
        "5+ Years",
      ],
    
    },
    otherField: {
      type: String,
      default: "Other",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('JobPost', jobPostSchema);
