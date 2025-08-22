const express = require('express');
const { sendOtp, selectRole, verifyOtp, sendOtpWebsite, verifyOtpWebsite } = require('../controllers/userController');

const { getIndustryBasedOnRole, getCategoryBasedOnRole, 
    getJobProfileBasedOnRole, getSalaryTypeBasedOnRole, 
    getExperienceRangeBasedOnRole, getJobTypeBasedOnRole, 
    getOtherFieldBasedOnRole, 
    getJobPostsByCategoryPublic, getAllCategoriesPublic,
getAllIndustriesPublic, getFeaturedCompaniesPublic } = require('../controllers/adminController');
    
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
router.get("/public-categories", getAllCategoriesPublic);
router.get("/public-industries", getAllIndustriesPublic);


//get job profile list for job_seeker
router.get("/job-profile", verifyToken, verifyJobSeekerOnly, getJobProfileBasedOnRole);

//get exp range list for employer
router.get("/experience-range", verifyToken, verifyEmployerOnly, getExperienceRangeBasedOnRole);

//get other field list for employer
router.get("/other-field", verifyToken, verifyEmployerOnly, getOtherFieldBasedOnRole);

//get job type list for employer and job_seeker
router.get("/job-type", verifyToken, getJobTypeBasedOnRole);

//get salary type list for employer and job_seeker
router.get("/salary-type", verifyToken, getSalaryTypeBasedOnRole);

//get job list based on category 
router.get("/public-categories/:categoryId", getJobPostsByCategoryPublic);

//featured companies list without token
router.get("/public-featured-companies", getFeaturedCompaniesPublic);



module.exports = router;