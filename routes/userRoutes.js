const express = require('express');
const { sendOtp, selectRole, verifyOtp } = require('../controllers/userController');
const router = express.Router();

router.post('/sendOtp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/select-role', selectRole);


module.exports = router;