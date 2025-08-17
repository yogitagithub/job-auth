const express = require('express');
const { sendOtp, selectRole, verifyOtp, sendOtpWebsite, verifyOtpWebsite } = require('../controllers/userController');
const { getIndustryBasedOnRole, getCategoryBasedOnRole, getJobPostsByCategoryPublic } = require('../controllers/adminController');
const { verifyToken, verifyJobSeekerOnly, verifyEmployerOnly } = require('../middleware/authMiddleware');

const router = express.Router();

//for mobile
router.post('/sendOtp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/select-role', selectRole);

//for website
router.post('/send-otp-website', sendOtpWebsite);
 router.post('/verify-otp-website', verifyOtpWebsite);

//get category and industry list for employer and job_seeker
router.get('/industries', verifyToken, getIndustryBasedOnRole);
router.get('/categories', verifyToken, getCategoryBasedOnRole);

//get job list based on category 
router.get("/public-categories/:categoryId", getJobPostsByCategoryPublic);


module.exports = router;