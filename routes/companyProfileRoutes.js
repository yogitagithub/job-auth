const express = require("express");
const router = express.Router();
const uploadImage = require('../middleware/uploadImage');
const { saveProfile, getProfile, deleteCompanyProfile, updateProfileImage, getProfileImage, getAllCompanies } = require('../controllers/companyProfileController');
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


module.exports = router;
