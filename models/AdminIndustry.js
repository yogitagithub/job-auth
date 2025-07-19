const mongoose = require("mongoose");

const industryTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true }
}, { timestamps: true });

module.exports = mongoose.model("IndustryType", industryTypeSchema);
