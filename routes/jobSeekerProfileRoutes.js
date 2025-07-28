const express = require("express");
const router = express.Router();
const upload = require('../middleware/upload'); 
const { saveProfile, getProfile, updateProfileImage, getProfileImage } = require('../controllers/jobSeekerController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-jobSeeker-profile', verifyToken, saveProfile);
router.get('/get-jobSeeker-profile', verifyToken, getProfile);

router.post('/jobSeeker-profile-image',
     verifyToken,
       upload.single("image"),
      updateProfileImage);

router.get('/jobSeeker-profile-image', 
          verifyToken,  
          getProfileImage);


module.exports = router;