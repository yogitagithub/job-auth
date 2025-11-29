const mongoose = require("mongoose");
const StateCity = require("./StateCity"); 

const companyProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    unique: true,
    required: true
  },

  phoneNumber: {
    type: String,
    required: true
  },

  companyName: {
    type: String,
    trim: true
  },

   employerType: {
  type: String,
  required: false,  
  default: null
},

  industryType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "IndustryType",
  },

  contactPersonName: { type: String, trim: true },
  // panCardNumber: { type: String, trim: true },
  gstNumber: { type: String, trim: true },



  //certificate upload part
   gstCertificate: {
    fileUrl:  { type: String, trim: true },
    fileName: { type: String, trim: true },
    fileType: { type: String, trim: true }, // e.g., "application/pdf"
    fileSize: { type: Number },             // bytes
   
  },

 


  // alternatePhoneNumber: { type: String },

  email: {
    type: String,
    lowercase: true,
    trim: true
  },

  companyAddress: { type: String },


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

  pincode: { type: String },

  image: {
    type: String,
    trim: true
  },

  aboutCompany: {
     type: String,
      default: null,
    trim: true
  },

   isDeleted: { 
    type: Boolean, 
    default: false 
  },

    profileViews: [
      {
        jobSeekerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "JobSeekerProfile",
          required: true,
        },


        lastViewedAt: { type: Date, default: Date.now },
        viewCount: { type: Number, default: 1 },
      },
    ],

     totalViews: { type: Number, default: 0 },
  
}, {
  timestamps: true
});

module.exports = mongoose.model("CompanyProfile", companyProfileSchema);
