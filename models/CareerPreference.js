const mongoose = require("mongoose");

const CareerPreferenceSchema = new mongoose.Schema(
  {
   

     userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        unique: true,
        required: true
      },

   preferredLocations: {
  type: [String],           // array of strings
  validate: {
    validator: function(arr) {
      return arr.length > 0;  // require at least one location
    },
    message: "At least one preferred location is required"
  },
  set: (arr) => arr.map(v => v.trim()),  // trim spaces
},



    jobRole:           { 
        type: String, 
        trim: true,
         maxlength: 100 
        },

    jobType: { 
       type: mongoose.Schema.Types.ObjectId,
      ref: "JobType",
        required: true 
    }, 
    

   
    currentSalary: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CurrentSalary",
      required: true,
     
    },

   
    
    negotiable: { 
        type: Boolean, 
        default: true 
    },

   
    highestEducation: { 
        type: String, 
        trim: true,
         maxlength: 80 
        },

  
    totalExperienceYears: { 
        type: String, 
       
        default: 0
     },

    
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
     
    },

  
    
    noticePeriodDays: { 
        type: Number, 
        min: 0, 
        max: 365, 
        default: 0 
    },

    isDeleted: { 
        type: Boolean, 
        default: false 
        
     },
   
  },
  { timestamps: true }
);

module.exports = mongoose.model("CareerPreference", CareerPreferenceSchema);