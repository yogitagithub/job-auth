const mongoose = require("mongoose");

const workingShiftSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  isDeleted: {
    type: Boolean,
    default: false
  }

},
  { timestamps: true });

module.exports = mongoose.model("WorkingShift", workingShiftSchema);
