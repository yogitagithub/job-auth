const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const userRoutes = require('./routes/userRoutes');
const companyProfileRoutes = require("./routes/companyProfileRoutes");
const jobSeekerProfileRoutes = require("./routes/jobSeekerProfileRoutes");
const dotenv = require("dotenv");
dotenv.config();


connectDB();

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.urlencoded({
  extended: true
}));

app.use('/api/auth', userRoutes);
app.use('/api/auth', companyProfileRoutes);
app.use('/api/auth', jobSeekerProfileRoutes);

const PORT = process.env.PORT || 8001;
app.listen(PORT, () => {
  console.log(
    `Server Running on port no ${PORT}`
  );
});