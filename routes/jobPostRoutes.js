const express = require("express");
const router = express.Router();

const { createJobPost, getAllJobPosts, 
    getJobPostById, updateJobPostById, 
    updateJobPostStatus, deleteJobPostById, 
    getAllJobPostsPublic, getJobDetailsPublic, 
    getTopCategories, getBasedOnSkillsJobs, getRecommendedJobs } = require('../controllers/jobPostController');
    
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-job-post', verifyToken, createJobPost);
router.get('/get-job-post', verifyToken, getAllJobPosts);
router.get('/get-job-post-id/:id', verifyToken, getJobPostById);

router.put('/update-job-post', verifyToken, updateJobPostById);
router.delete('/delete-job-post', verifyToken, deleteJobPostById);


router.put("/jobPostStatus", verifyToken, updateJobPostStatus);

//get all job post without token
router.get("/public-jobs", getAllJobPostsPublic);

//get job details by job id without token
router.get("/public-job-details/:id", getJobDetailsPublic);


//top 5 categories and its job post in array format without token
router.get("/top-categories", getTopCategories);



//get job list based on job seeker skills
router.get("/based-on-skills", verifyToken, getBasedOnSkillsJobs);



//get recommended job list for job seekers only
router.get("/recommended-jobPost", verifyToken, getRecommendedJobs);






module.exports = router;