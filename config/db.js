// const mongoose = require("mongoose");

// const connectDB = async () => {
//   try {
//     await mongoose.connect(process.env.MONGO_URL);
//     console.log(
//       'Connected to Mongodb Database'
        
//     );
//   } catch (error) {
//     console.log(`MONGO Connect Error ${error}`);
//   }
// };

// module.exports = connectDB;



const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      serverSelectionTimeoutMS: 5000, // don't hang forever
    });

    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("MongoDB connection FAILED:", error.message);
    throw error; // 🔥 THIS IS THE KEY
  }
};

module.exports = connectDB;
