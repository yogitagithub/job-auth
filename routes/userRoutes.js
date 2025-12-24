const express = require('express');
const { sendOtp, selectRole, verifyOtp, sendOtpWebsite, verifyOtpWebsite, logout } = require('../controllers/userController');

const { getIndustryBasedOnRole, getCategoryBasedOnRole, 
    getJobProfileBasedOnRole, getSalaryTypeBasedOnRole, 
    getExperienceRangeBasedOnRole, getJobTypeBasedOnRole, 
    getOtherFieldBasedOnRole, 
    getJobPostsByCategoryPublic, getAllCategoriesPublic, getAllExperiencesPublic,
getAllIndustriesPublic, getFeaturedCompaniesPublic, getJobPostsByCompanyPublic, 
getWorkingShiftBasedOnRole, getAccountTypeBasedOnRole, getJobPostsByCategoryId, getAllJobTypesPublic } = require('../controllers/adminController');
    
const { saveEmail } = require("../controllers/emailController");

const { verifyToken, verifyAdmin, verifyJobSeekerOnly, verifyEmployerOnly } = require('../middleware/authMiddleware');

const router = express.Router();


//for testing purpose
router.get('/test', (req, res) => {
    res.json({ message: "API is working fine" });
});


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


//without token
router.get("/public-experience-range", getAllExperiencesPublic);


//get job list based on category id for job_seeker and employer
router.get('/job-list/:categoryId', verifyToken, getJobPostsByCategoryId);


//get job profile list for job_seeker and employer
router.get("/job-profile", verifyToken, getJobProfileBasedOnRole);

//get exp range list for employer and job_seeker
router.get("/experience-range", verifyToken, getExperienceRangeBasedOnRole);

//get other field list for employer and job_seeker
router.get("/other-field", verifyToken, getOtherFieldBasedOnRole);

//get job type list for employer and job_seeker
router.get("/job-type", verifyToken, getJobTypeBasedOnRole);

//get salary type list for employer and job_seeker
router.get("/salary-type", verifyToken, getSalaryTypeBasedOnRole);

//get job list based on category id without token
router.get("/public-categories/:categoryId", getJobPostsByCategoryPublic);

//get job list based on company id 
router.get("/public-companies/:companyId", getJobPostsByCompanyPublic);

//featured companies list without token
router.get("/public-featured-companies", getFeaturedCompaniesPublic);


//get working shift list for job_seeker and employer
router.get("/working-shift", verifyToken, getWorkingShiftBasedOnRole);



//get account type list for employer and job_seeker
router.get("/account-type", verifyToken, getAccountTypeBasedOnRole);

//logout api for job seeker and employer
router.post('/logout', verifyToken, logout);

//get all public job types list without token 
router.get("/publicJobtypes", getAllJobTypesPublic);


//newsletter
router.post("/saveEmail", saveEmail);






module.exports = router;