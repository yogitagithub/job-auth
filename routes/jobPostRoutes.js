const express = require("express");
const router = express.Router();
const { createJobPost, getAllJobPosts, getJobPostById, updateJobPostById, updateJobPostStatus } = require('../controllers/jobPostController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-job-post', verifyToken, createJobPost);
router.get('/get-job-post', verifyToken, getAllJobPosts);
router.get('/get-job-post-id/:id', verifyToken, getJobPostById);
router.put('/update-job-post/:id', verifyToken, updateJobPostById);
router.patch("/jobPostStatus/:id/status", verifyToken, updateJobPostStatus);


module.exports = router;