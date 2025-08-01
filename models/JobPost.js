
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
      
       required: true
    },
   

    category: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Category",
  required: true
},



    industryType: {
     type: mongoose.Schema.Types.ObjectId,
  ref: "IndustryType",
  required: true
        },

   
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
      enum: ["Hourly", "Weekly", "Monthly"],
     
    },
    displayPhoneNumber: {
      type: String,
      match: /^[0-9]{8,15}$/, 
    
    },
    displayEmail: {
      type: String,
      match: /.+\@.+\..+/,
    
    },
    jobType: {
      type: String,
      enum: [
      
        "On-Site",
        "Full Time Remote",
        "Full Time On-Site",
        "Part Time Remote",
        "Part Time On-Site",
        "Contractual"
      ],
     },
    skills: {
      type: String,
      // default: [],
    },
    // salaryRange: {
      minSalary: {
        type: Number,
        },
      maxSalary: {
        type: Number,
        },
    // },
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
    status: {
  type: String,
  enum: ['active', 'expired', 'closed'],
  default: 'active'
},
    hourlyRate:  {
      type: Number
      },
  },
  { timestamps: true }
);

module.exports = mongoose.model('JobPost', jobPostSchema);
