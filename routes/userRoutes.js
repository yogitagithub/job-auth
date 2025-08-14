const express = require('express');
const { sendOtp, selectRole, verifyOtp } = require('../controllers/userController');
const { getIndustryBasedOnRole, getCategoryBasedOnRole, getJobPostsByCategoryPublic } = require('../controllers/adminController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/sendOtp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/select-role', selectRole);

//get category and industry list for employer and job_seeker
router.get('/industries', verifyToken, getIndustryBasedOnRole);
router.get('/categories', verifyToken, getCategoryBasedOnRole);

//get job list based on category 
router.get("/public-categories/:categoryId", getJobPostsByCategoryPublic);


module.exports = router;