const mongoose = require("mongoose");

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
  companyName: { type: String, trim: true },
  industryType: { type: String },
  contactPersonName: { type: String, trim: true },
  panCardNumber: { type: String, trim: true },
  gstNumber: { type: String, trim: true },
  alternatePhoneNumber: { type: String },
  email: { type: String,  lowercase: true,
      trim: true },
  companyAddress: { type: String },
  state: { type: String },
  city: { type: String },
  pincode: { type: String }
}, {
  timestamps: true
});

module.exports = mongoose.model("CompanyProfile", companyProfileSchema);
