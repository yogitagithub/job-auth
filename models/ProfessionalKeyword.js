const mongoose = require("mongoose");

const professionalKeywordSchema = new mongoose.Schema(
  {
    letter: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 1,
    },
    // 👇 array of strings, like cities[]
    names: [
      {
        type: String,
        trim: true,
        required: true,
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "List",
  professionalKeywordSchema
);
