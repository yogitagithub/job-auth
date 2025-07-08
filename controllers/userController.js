const User = require('../models/User');
const jwt = require('jsonwebtoken');


const isValidPhone = (phone) => /^\d{10}$/.test(phone);


exports.sendOtp = async (req, res) => {
  const { mobile } = req.body;

  if (!mobile) {
    return res.status(400).json({
      otp: null,
      status: false,
      error: 'Mobile number is required.'
    });
  }

  if (!isValidPhone(mobile)) {
    return res.status(400).json({
      otp: null,
      status: false,
      error: 'Invalid mobile number format. Must be 10 digits.'
    });
  }

  try {
   
    const otp = '1111'; 
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    let user = await User.findOne({ mobile });

    if (!user) {
      
      user = new User({
        mobile,
        otp,
        otpExpiresAt: expiresAt,
        role: null,
        token: null
      });
      await user.save();
      console.log(`New user created with OTP.`);
    } else {
     
      user.otp = otp;
      user.otpExpiresAt = expiresAt;
      await user.save();
      console.log(`OTP updated for existing user.`);
    }

    console.log(`OTP for ${mobile}: ${otp}, expires at: ${expiresAt.toISOString()}`);

    return res.json({
      otp,
      status: true
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    return res.status(500).json({
      otp: null,
      status: false,
      error: 'Internal server error. Please try again.'
    });
  }
};


exports.verifyOtp = async (req, res) => {
  const { mobile, otp } = req.body;

  if (!mobile || !otp) {
    return res.status(400).json({ error: 'Mobile number and OTP are required.' });
  }

  try {
    let user = await User.findOne({ mobile });

    if (!user) {
      // If mobile number is new, create it in DB and ask user to request OTP
      const newUser = new User({
        mobile,
        otp: null,
        otpExpiresAt: null
      });
      await newUser.save();

      return res.status(400).json({
        error: 'Mobile number not found. New mobile number saved. Please request OTP again.'
      });
    }

    // Check if OTP matches
    if (user.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP.' });
    }

    // Check if OTP is expired
    if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
      return res.status(400).json({ error: 'OTP has expired.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, mobile: user.mobile },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log(`OTP verified for mobile ${mobile}. Token issued.`);

    return res.json({ token });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

