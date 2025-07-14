const express = require("express");
const router = express.Router();
const { saveProfile, getProfile } = require('../controllers/companyProfileController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-company-profile', verifyToken, saveProfile);
router.get('/get-company-profile', verifyToken, getProfile);


module.exports = router;
