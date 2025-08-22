const mongoose = require("mongoose");

const FeaturedCompanySchema = new mongoose.Schema(
  {
    companyId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "CompanyProfile",
         required: true
     },

  
    orderNo: {
        type: Number, 
        required: true
     },

    isDeleted: {
         type: Boolean, 
         default: false 
        }
    },
    
{ timestamps: true });

    
module.exports = mongoose.model("FeaturedCompany", FeaturedCompanySchema);
