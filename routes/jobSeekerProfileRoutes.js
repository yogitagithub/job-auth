const express = require("express");
const router = express.Router();

const { saveProfile, getProfile, updateProfileImage, getProfileImage, 
  deleteProfile, getAllJobSeekers, getRecommendedProfiles, getTopProfiles } = require('../controllers/jobSeekerController');
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
router.get('/recommended-profiles', verifyToken, getRecommendedProfiles);


//get top job profile list for employers only
router.get('/top-profiles', verifyToken, getTopProfiles);




module.exports = router;