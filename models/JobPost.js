
const mongoose = require('mongoose');
const StateCity = require("./StateCity"); 

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

  

      skills: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Skill",
          }
        ],

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

    city: {
        type: String,
        validate: {
          validator: function (value) {
            if (!value) return true; 
            const state = this.state;
            if (!state) return false;
            
            return StateCity.findById(state).then((stateDoc) => {
              return stateDoc && stateDoc.cities.includes(value);
            });
          },
          message: 'City must be one of the cities defined in the selected state'
        }
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

     workingShift: {
     type: mongoose.Schema.Types.ObjectId,
      ref: "WorkingShift",
      required: true
    },

        
        jobProfile: {  
        type: mongoose.Schema.Types.ObjectId,
      ref: "JobProfile",
      },


       workLocation: {
     type: mongoose.Schema.Types.ObjectId,
      ref: "WorkLocation",
      required: true
    },

    // for employer it is: employer can change the status
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

     isLatest: {
      type: Boolean,
      default: false
    },


     isSaved: {
      type: Boolean,
      default: false
    },
    

     isActive: {
      type: Boolean,
      default: false
    },


    
    appliedCandidates: {
      type: Number,
      default: 0
    },

   
    
      isAdminApproved: {
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
