const mongoose = require("mongoose");

const stateCitySchema = new mongoose.Schema({
  state: { type: String, required: true, unique: true },
  cities: [String]
});

module.exports = mongoose.model("StateCity", stateCitySchema);
