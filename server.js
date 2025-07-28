const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");




const userRoutes = require('./routes/userRoutes');
const companyProfileRoutes = require("./routes/companyProfileRoutes");
const jobSeekerProfileRoutes = require("./routes/jobSeekerProfileRoutes");
const jobPostRoutes = require("./routes/jobPostRoutes");

const educationRoutes = require("./routes/educationRoutes");
const workRoutes = require("./routes/workExpRoutes");
const resumeRoutes = require("./routes/resumeRoutes");
const skillsRoutes = require("./routes/skillsRoutes");
const applyJobRoutes = require("./routes/applyJobRoutes");
const stateCityRoutes = require("./routes/stateCityRoutes");

// const taskRoutes = require("./routes/taskRoutes");

const adminRoutes = require("./routes/adminRoutes");

const dotenv = require("dotenv");
dotenv.config();


connectDB();

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.urlencoded({
  extended: true
}));

const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', userRoutes);
app.use('/api/auth', companyProfileRoutes);
app.use('/api/auth', jobSeekerProfileRoutes);
app.use('/api/auth', jobPostRoutes);

app.use('/api/auth', educationRoutes);
app.use('/api/auth', workRoutes);
app.use('/api/auth', resumeRoutes);
app.use('/api/auth', skillsRoutes);
app.use('/api/auth', applyJobRoutes);
// app.use('/api/auth', taskRoutes);
app.use('/api/auth', stateCityRoutes);
app.use('/api/auth/admin', adminRoutes);

const PORT = process.env.PORT || 8001;
app.listen(PORT, () => {
  console.log(
    `Server Running on port no ${PORT}`
  );
});