const express = require("express");
const router = express.Router();
const { saveProfile, getProfile } = require('../controllers/companyProfileController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-company-profile', verifyToken, saveProfile);
router.get('/get-company-profile', verifyToken, getProfile);
// router.post('/create-job-post', verifyToken, createJobPost);
// router.get('/get-job-post', verifyToken, getAllJobPosts);
// router.get('/get-job-post-id/:id', verifyToken, getJobPostById);

module.exports = router;
