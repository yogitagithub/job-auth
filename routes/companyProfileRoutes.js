const express = require("express");
const router = express.Router();
const { saveProfile, getProfile } = require('../controllers/companyProfileController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/company-profile', verifyToken, saveProfile);
router.get('/company-profile', verifyToken, getProfile);


module.exports = router;
