const express = require("express");
const router = express.Router();
const upload = require('../middleware/upload'); 
const { saveProfile, getProfile, updateProfileImage, getProfileImage, getAllCompanies } = require('../controllers/companyProfileController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-company-profile', verifyToken, saveProfile);
router.get('/get-company-profile', verifyToken, getProfile);

router.post('/company-profile-image', 
    verifyToken,  
    upload.single('image'), 
    updateProfileImage);

router.get('/company-profile-image', 
    verifyToken,  
    getProfileImage);

router.get("/public-companies", getAllCompanies);


module.exports = router;
