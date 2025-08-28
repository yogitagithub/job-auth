const express = require("express");
const router = express.Router();

const { saveProfile, getProfile, updateProfileImage, getProfileImage, deleteProfile, getAllJobSeekers } = require('../controllers/jobSeekerController');
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


module.exports = router;