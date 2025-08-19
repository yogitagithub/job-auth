
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
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalaryType",
      required: true
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
     type: mongoose.Schema.Types.ObjectId,
      ref: "JobType",
      required: true
    },

    skills: {
      type: String,
    },

    minSalary: {
      type: Number,
    },

    maxSalary: {
      type: Number,
    },

    state: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StateCity",
      required: true
    },

    experience: {
     type: mongoose.Schema.Types.ObjectId,
      ref: "ExperienceRange",
      required: true
    },

    otherField: {
     type: mongoose.Schema.Types.ObjectId,
      ref: "OtherField",
      required: true
    },

    status: {
      type: String,
      enum: ['active', 'expired', 'inactive'],
      default: 'active'
    },

    hourlyRate: {
      type: Number
    },

  expiredDate: { 
    type: Date,
     required: true
   },

    isApplied: {
      type: Boolean,
      default: false
    },

    isDeleted: {
      type: Boolean,
      default: false
    }
  
  },
  { timestamps: true }
);

module.exports = mongoose.model('JobPost', jobPostSchema);
