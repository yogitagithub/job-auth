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

  industryType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "IndustryType",
  },

  contactPersonName: { type: String, trim: true },
  panCardNumber: { type: String, trim: true },
  gstNumber: { type: String, trim: true },
  alternatePhoneNumber: { type: String },

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

   isDeleted: { 
    type: Boolean, 
    default: false 
  }
  
}, {
  timestamps: true
});

module.exports = mongoose.model("CompanyProfile", companyProfileSchema);
