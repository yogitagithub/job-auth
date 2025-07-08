const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const dotenv = require("dotenv");
dotenv.config();


connectDB();

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.urlencoded({
  extended: true
}));


const userRoutes = require('./routes/userRoutes');
app.use('/api/auth', userRoutes);

const PORT = process.env.PORT || 8001;
app.listen(PORT, () => {
  console.log(
    `Server Running on port no ${PORT}`
  );
});