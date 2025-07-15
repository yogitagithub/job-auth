const express = require("express");
const router = express.Router();
const { saveProfile, getProfile, updateProfileImage } = require('../controllers/companyProfileController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-company-profile', verifyToken, saveProfile);
router.get('/get-company-profile', verifyToken, getProfile);
router.patch('/company-profile-image', verifyToken, updateProfileImage);


module.exports = router;
