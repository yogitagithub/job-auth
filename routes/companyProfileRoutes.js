const express = require("express");
const router = express.Router();
const uploadImage = require('../middleware/uploadImage');
const { saveProfile, getProfile, deleteCompanyProfile, updateProfileImage, getProfileImage, getAllCompanies, 
    getEmployerProfileProgress, getCompanyProfileViews, recordCompanyProfileView, getCompanyDashboardWeb, 
    getCompanyDashboard, getCompanyAnalytics } = require('../controllers/companyProfileController');
const { verifyToken } = require('../middleware/authMiddleware');
const uploadCertificate = require("../middleware/uploadCertificate");


router.post('/create-company-profile', verifyToken, 
    uploadCertificate.single("certificate"), 
    saveProfile);

router.get('/get-company-profile', verifyToken, getProfile);
router.delete('/delete-company-profile', verifyToken, deleteCompanyProfile);

router.post('/company-profile-image', 
    verifyToken,  
    uploadImage.single('image'), 
    updateProfileImage);

router.get('/company-profile-image', 
    verifyToken,  
    getProfileImage);

router.get("/public-companies", getAllCompanies);


//get progress bar for employer profile completion
router.get('/company-progress-bar', verifyToken, getEmployerProfileProgress);



//get profile views of a company profile by job seeker
router.get('/profileView', verifyToken, getCompanyProfileViews);

router.post("/record-profile/:companyId", verifyToken, recordCompanyProfileView);


//dashboard route for website
router.get('/companyDashboard', verifyToken, getCompanyDashboardWeb);

//dashboard route for mobile
router.get('/dashboard', verifyToken, getCompanyDashboard);

//company analytics
router.get("/companyAnalytics", verifyToken, getCompanyAnalytics);




module.exports = router;
