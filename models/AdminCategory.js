const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({

  name: { type: String, 
    required: true, 
    unique: true, 
    trim: true },

     image: { 
      type: String, 
      required: false, 
      trim: true 
    },

        isDeleted: {
        type: Boolean,
        default: false
    }
    
}, 
{ timestamps: true });

module.exports = mongoose.model("Category", categorySchema);
