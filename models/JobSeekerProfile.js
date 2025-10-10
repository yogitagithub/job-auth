const mongoose = require("mongoose");
const StateCity = require("./StateCity"); 

const profileSchema = new mongoose.Schema(
  {
     userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      },
      
      phoneNumber: {
        type: String,
        required: true
      },

       image: {
    type: String,
    trim: true
   },

    name: {
      type: String,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
     
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
    
    },
   
    email: {
      type: String,
      sparse: true,
      lowercase: true,
      trim: true,
    },

    industryType: {  
    type: mongoose.Schema.Types.ObjectId,
  ref: "IndustryType",
  },

     panCardNumber: { type: String, trim: true },

      alternatePhoneNumber: { type: String },
      
    jobProfile: {  
    type: mongoose.Schema.Types.ObjectId,
  ref: "JobProfile",
  },

    address: {
      type: String,
     
    },
  
     state: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StateCity",
       
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

    pincode: {
      type: String,
     },


      isDeleted: { 
    type: Boolean, 
    default: false 
  },


  isExperienced: {   
    type: Boolean, 
    default: false 
  },


 

   isResumeAdded:     { type: Boolean, default: false },
    isEducationAdded:  { type: Boolean, default: false },
    isSkillsAdded:     { type: Boolean, default: false },
    isExperienceAdded: { type: Boolean, default: false },


     adminRecommendedSeeker: {
      type: Boolean,
      default: false
    },



     adminTopProfiles: {
      type: Boolean,
      default: false
    },

    

  CurrentSalary: {
    type: Number,
    min: 0,
    // Required only when isExperienced is true
    required: function () { return this.isExperienced === true; }
  },

   salaryType: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SalaryType",
        required: true
      },

      myJobs: { 
    type: Number, 
    default: 0 
  },

   myAttendance: { 
    type: Number, 
    default: 0 
  },


  
  
  },
  { timestamps: true }
);

module.exports = mongoose.model("JobSeekerProfile", profileSchema);
