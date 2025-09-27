const express = require("express");
const router = express.Router();

const { saveProfile, getProfile, updateProfileImage, getProfileImage, 
  deleteProfile, getAllJobSeekers, getRecommendedProfiles, getTopProfiles, getProfileProgress, 
  getSeekerDetails, getJobSeekerDashboard, getSeekerDashboardWeb, getTopIndustryTypes, getMyApprovedApplications } = require('../controllers/jobSeekerController');
const { verifyToken } = require('../middleware/authMiddleware');
const uploadImage = require('../middleware/uploadImage');


router.post('/create-jobSeeker-profile', verifyToken, saveProfile);
router.get('/get-jobSeeker-profile', verifyToken, getProfile);
router.delete('/delete-jobSeeker-profile', verifyToken, deleteProfile);

router.post('/jobSeeker-profile-image',
     verifyToken,
       uploadImage.single("image"),
      updateProfileImage);

router.get('/jobSeeker-profile-image', 
          verifyToken,  
          getProfileImage);

          router.get("/public-jobSeekers", getAllJobSeekers);


//get recommended job profile list for employers only
router.get('/recommendedProfiles', verifyToken, getRecommendedProfiles);


//get top job profile list for employers only
router.get('/topProfiles', verifyToken, getTopProfiles);


//get progress bar for job seeker profile completion
router.get('/seeker-progress-bar', verifyToken, getProfileProgress);

//without token get job seeker details
router.get('/job-seeker-details/:jobSeekerId', getSeekerDetails);

//dashboard of job seeker (mobile)
router.get('/job-seeker-dashboard',verifyToken, getJobSeekerDashboard);

//dashboard of job seeker (website)
router.get('/seeker-dashboard',verifyToken, getSeekerDashboardWeb);


//get job seeker employerApprovalStatus=approved job applications
router.get("/my-approved-applications", verifyToken, getMyApprovedApplications);


//top 5 industry types and its job seeker list in array format without token
router.get("/top-industryTypes", getTopIndustryTypes);






module.exports = router;