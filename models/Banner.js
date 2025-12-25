const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true
    },

    subtitle: {
      type: String,
      trim: true
    },

    imageUrl: {
      type: String,
      required: true
    },

    isRedirectable: {
      type: Boolean,
      default: false
    },

    Url: {
      type: String,
      default: ""
    },

    isDeleted: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Banner", bannerSchema);
