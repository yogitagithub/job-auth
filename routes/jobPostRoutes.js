const express = require("express");
const router = express.Router();
const { createJobPost, getAllJobPosts } = require('../controllers/jobPostController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-job-post', verifyToken, createJobPost);
router.get('/get-job-post', verifyToken, getAllJobPosts);


module.exports = router;