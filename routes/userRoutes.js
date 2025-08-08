const express = require('express');
const { sendOtp, selectRole, verifyOtp } = require('../controllers/userController');
const { getIndustryBasedOnRole, getCategoryBasedOnRole } = require('../controllers/adminController');
 const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/sendOtp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/select-role', selectRole);

router.get('/industries', verifyToken, getIndustryBasedOnRole);
router.get('/categories', verifyToken, getCategoryBasedOnRole);


module.exports = router;