const express = require("express");
const router = express.Router();
const { saveProfile, getProfile } = require('../controllers/jobSeekerController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/jobSeeker-profile', verifyToken, saveProfile);
router.get('/jobSeeker-profile', verifyToken, getProfile);


module.exports = router;