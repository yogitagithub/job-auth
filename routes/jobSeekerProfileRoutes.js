const express = require("express");
const router = express.Router();
const upload = require('../middleware/upload'); 
const { saveProfile, getProfile, updateProfileImage } = require('../controllers/jobSeekerController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-jobSeeker-profile', verifyToken, saveProfile);
router.get('/get-jobSeeker-profile', verifyToken, getProfile);

router.patch('/jobSeeker-profile-image',
     verifyToken,
       upload.single("image"),
      updateProfileImage);


module.exports = router;