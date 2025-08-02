const express = require("express");
const router = express.Router();
const { createJobPost, getAllJobPosts, getJobPostById, updateJobPostById, updateJobPostStatus, getAllJobPostsPublic } = require('../controllers/jobPostController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-job-post', verifyToken, createJobPost);
router.get('/get-job-post', verifyToken, getAllJobPosts);
router.get('/get-job-post-id/:id', verifyToken, getJobPostById);

router.put('/update-job-post', verifyToken, updateJobPostById);

// router.put('/update-job-post/:id', verifyToken, updateJobPostById);
router.put("/jobPostStatus", verifyToken, updateJobPostStatus);
router.get("/public-jobs", getAllJobPostsPublic);


module.exports = router;