const express = require("express");
const router = express.Router();
const { saveProfile, getProfile } = require('../controllers/jobSeekerController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-jobSeeker-profile', verifyToken, saveProfile);
router.get('/get-jobSeeker-profile', verifyToken, getProfile);


module.exports = router;