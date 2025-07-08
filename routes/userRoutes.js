const express = require('express');
const { sendOtp, verifyOtp } = require('../controllers/userController');
const router = express.Router();

router.post('/sendOtp', sendOtp);
router.post('/verify-otp', verifyOtp);


module.exports = router;