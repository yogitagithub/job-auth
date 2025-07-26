const User = require('../models/User');
const jwt = require('jsonwebtoken');
const CompanyProfile = require('../models/CompanyProfile');
const JobSeekerProfile = require("../models/JobSeekerProfile");

const isValidPhone = (phone) => /^\d{10}$/.test(phone);

exports.sendOtp = async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({
      otp: null,
      status: false,
      error: 'phoneNumber number is required.'
    });
  }

  if (!isValidPhone(phoneNumber)) {
    return res.status(400).json({
      otp: null,
      status: false,
      error: 'Invalid phoneNumber number format. Must be 10 digits.'
    });
  }

  try {
   
    const otp = '1111'; 
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    let user = await User.findOne({ phoneNumber });

    if (!user) {
      
      user = new User({
        phoneNumber,
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

    console.log(`OTP for ${phoneNumber}: ${otp}, expires at: ${expiresAt.toISOString()}`);

    // return res.json({
    //   otp,
    //   status: true
    // });


    return res.status(200).json({
      status: true,
      message: "OTP sent successfully",
      result: {
        otp
      }
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


exports.selectRole = async (req, res) => {
  const { phoneNumber, role } = req.body;

  if (!phoneNumber || !role) {
    return res.status(400).json({
      status: false,
      error: "phoneNumber and role are required."
    });
  }

  if (!isValidPhone(phoneNumber)) {
    return res.status(400).json({
      otp: null,
      status: false,
      error: "Invalid phoneNumber format. Must be 10 digits."
    });
  }

  if (!["job_seeker", "employer"].includes(role)) {
    return res.status(400).json({
      status: false,
      error: "Invalid role selected. Must be 'job_seeker' or 'employer'."
    });
  }

  try {
    const user = await User.findOne({ phoneNumber });

    if (!user) {
      return res.status(404).json({
        status: false,
        error: "User not found",
        role: null
      });
    }

    user.role = role;

    const token = jwt.sign(
      { userId: user._id, phoneNumber: user.phoneNumber, role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    user.token = token;
    await user.save();

    let companyProfileData = null;
    let jobSeekerProfileData = null;

    if (role === "employer") {
      const existingProfile = await CompanyProfile.findOne({ userId: user._id });

      if (!existingProfile) {
        await CompanyProfile.create({
          userId: user._id,
          phoneNumber: user.phoneNumber,
          companyName: null,
          industryType: null,
          contactPersonName: null,
          panCardNumber: null,
          gstNumber: null,
          alternatePhoneNumber: null,
          email: null,
          companyAddress: null,
          state: null,
          city: null,
          pincode: null
        });
      }

     
      companyProfileData = {
        companyName: null,
        industryType: null,
        contactPersonName: null,
        panCardNumber: null,
        gstNumber: null,
        alternatePhoneNumber: null,
        email: null,
        companyAddress: null,
        state: null,
        city: null,
        pincode: null
      };
    }

    if (role === "job_seeker") {
      const existingJobSeekerProfile = await JobSeekerProfile.findOne({ userId: user._id });

      if (!existingJobSeekerProfile) {
        await JobSeekerProfile.create({
          userId: user._id,
          phoneNumber: user.phoneNumber,
          name: null,
          dateOfBirth: null,
          gender: null,
          email: null,
          industry: null,
          jobProfile: null,
          address: null,
          state: null,
          city: null,
          pincode: null,
          alternatePhoneNumber: null,
          panCardNumber: null
        });
      }

     
      jobSeekerProfileData = {
        name: null,
        dateOfBirth: null,
        gender: null,
        email: null,
        industry: null,
        jobProfile: null,
        address: null,
        state: null,
        city: null,
        pincode: null,
         alternatePhoneNumber: null,
          panCardNumber: null
      };
    }

    // return res.json({
    //   status: true,
    //   message: `Role updated to ${role}.`,
    //   role,
    //   token,
    //   ...(companyProfileData && { companyProfile: companyProfileData }),
    //   ...(jobSeekerProfileData && { jobSeekerProfile: jobSeekerProfileData })
    // });


     return res.status(200).json({
      status: true,
      message: `Role updated to ${role}.`,
      result: {
        role,
        token,
        ...(role === "employer" ? { companyProfile: companyProfileData } : {}),
        ...(role === "job_seeker" ? { jobSeekerProfile: jobSeekerProfileData } : {})
      }
    });



  } catch (error) {
    console.error("Error updating role:", error);
    return res.status(500).json({
      status: false,
      error: "Internal server error."
    });
  }
};

exports.verifyOtp = async (req, res) => {
  const { phoneNumber, otp } = req.body;

  if (!phoneNumber || !otp) {
    return res.status(400).json({
      status: false,
      message: 'phoneNumber and OTP are required.'
    });
  }

  if (!isValidPhone(phoneNumber)) {
    return res.status(400).json({
      otp: null,
      status: false,
      error: 'Invalid phoneNumber format. Must be 10 digits.'
    });
  }

  try {
    let user = await User.findOne({ phoneNumber });

    if (!user) {
      const newUser = new User({
        phoneNumber,
        otp: null,
        otpExpiresAt: null
      });
      await newUser.save();

      return res.status(400).json({
        status: false,
        message: 'phoneNumber not found. New phoneNumber saved. Please request OTP again.'
      });
    }

    if (user.otp !== otp) {
      return res.status(400).json({
        status: false,
        message: 'OTP not verified'
      });
    }

    if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
      return res.status(400).json({
        status: false,
        message: 'OTP has expired'
      });
    }

   
    // const response = {
    //   status: true,
    //   message: 'OTP verified',
    //   role: user.role
    // };


  //    const response = {
  //     status: true,
  //     message: 'OTP verified',
  //      result: {
  //     role: user.role
  //   }
  // };

   const result = {
      role: user.role
    };

     
    if (user.role) {
      const token = jwt.sign(
        { userId: user._id, phoneNumber: user.phoneNumber, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );

      user.token = token;
      await user.save();

      // response.token = token;
       result.token = token;
     
    }

    //  return res.json(response);

     return res.status(200).json({
      status: true,
      message: 'OTP verified',
      result
    });

  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({
      status: false,
      message: 'Internal server error'
    });
  }
};






