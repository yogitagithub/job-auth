require("dotenv").config();
const mongoose = require("mongoose");
const List = require("../models/ProfessionalKeyword");
const data = require("../data/professionalKeywordsSeed.json");

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URL);

    // clear existing docs
    await List.deleteMany({});

    // 👉 insert data as-is: one doc per letter (A–Z)
    const docs = data.map(group => ({
      letter: group.letter,
      names: group.names,
      isDeleted: false,
    }));

    await List.insertMany(docs);

    console.log("Professional Keywords seeded successfully");
    process.exit(0);
  } catch (err) {
    console.error("Seed error (professional keywords):", err);
    process.exit(1);
  }
}

seed();
