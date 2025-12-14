const mongoose = require("mongoose");

const savedEmailSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    role: {
      type: String,
      enum: ["employer", "jobseeker"],
      required: true
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Prevent duplicate email per user
savedEmailSchema.index({ userId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model("SavedEmail", savedEmailSchema);
