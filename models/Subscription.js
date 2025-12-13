const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    subscriptionMonth: {
      type: Number, // duration in months (e.g. 1, 2, 3, 6, 12)
      required: true,
      min: 1,
    },

    numberOfJobPost: {
      type: Number,
      required: true,
      min: 0,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
