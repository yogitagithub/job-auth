const express = require("express");
const router = express.Router();
const { saveProfile, getProfile, updateProfileImage } = require('../controllers/jobSeekerController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-jobSeeker-profile', verifyToken, saveProfile);
router.get('/get-jobSeeker-profile', verifyToken, getProfile);
router.patch('/jobSeeker-profile-image', verifyToken, updateProfileImage);


module.exports = router;