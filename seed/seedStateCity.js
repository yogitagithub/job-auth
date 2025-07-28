require('dotenv').config();
const mongoose = require("mongoose");
const StateCity = require("../models/StateCity");
const data = require("../data/stateCitySeed.json");


async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    await StateCity.deleteMany({});
    await StateCity.insertMany(data);
    console.log("State and city data seeded successfully");
    process.exit();
  } catch (err) {
    console.error("Seed error:", err);
    process.exit(1);
  }
}

seed();
