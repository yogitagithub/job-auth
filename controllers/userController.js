const User = require('../models/User');
const jwt = require('jsonwebtoken');
const CompanyProfile = require('../models/CompanyProfile');
const JobSeekerProfile = require("../models/JobSeekerProfile");

const isValidPhone = (phone) => /^\d{10}$/.test(phone);


//for mobile
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

    
       result.token = token;
     
    }

   
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
          pincode: null,
          image: null
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
        pincode: null,
         image: null
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
          panCardNumber: null,
           image: null
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
          panCardNumber: null,
           image: null
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

//for website

exports.sendOtpWebsite = async (req, res) => {
  const { phoneNumber, role } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ otp: null, status: false, error: "phoneNumber number is required." });
  }
  if (!isValidPhone(phoneNumber)) {
    return res.status(400).json({ otp: null, status: false, error: "Invalid phoneNumber number format. Must be 10 digits." });
  }
  if (!["employer", "job_seeker"].includes(role)) {
    return res.status(400).json({ otp: null, status: false, error: "Invalid role. Must be 'employer' or 'job_seeker'." });
  }

  try {
    const otp = "1111"; // demo OTP
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    let user = await User.findOne({ phoneNumber });

    // block role switching for an existing number
    if (user && user.role && user.role !== role) {
      return res.status(409).json({
        status: false,
        message: `This phone number is already registered as '${user.role}'.`,
       
      });
    }

    if (!user) {
      // New user → set role now (no profile creation here)
      user = await User.create({
        phoneNumber,
        otp,
        otpExpiresAt: expiresAt,
        role,
        token: null
      });
    } else {
      // Existing user → refresh OTP; set role only if not set yet
      user.otp = otp;
      user.otpExpiresAt = expiresAt;
      if (!user.role) user.role = role; // don't overwrite if already set (and same)
      await user.save();
    }

    return res.status(200).json({
      status: true,
      message: "OTP sent successfully",
      result: { otp }
    });
  } catch (error) {
    console.error("sendOtpWebsite error:", error);
    return res.status(500).json({ otp: null, status: false, error: "Internal server error. Please try again." });
  }
};



exports.verifyOtpWebsite = async (req, res) => {
  const { phoneNumber, otp } = req.body;

  if (!phoneNumber || !otp) {
    return res.status(400).json({ status: false, message: 'phoneNumber and OTP are required.' });
  }
  if (!isValidPhone(phoneNumber)) {
    return res.status(400).json({ status: false, message: 'Invalid phoneNumber format. Must be 10 digits.' });
  }

  try {
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(404).json({ status: false, message: 'Phone number not found. Please request OTP again.' });
    }

    // OTP validation
    if (user.otp !== otp) return res.status(400).json({ status: false, message: 'OTP not verified' });
    if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
      return res.status(400).json({ status: false, message: 'OTP has expired' });
    }

    // role must have been set at sendOtpWebsite
    if (!user.role || !['employer', 'job_seeker'].includes(user.role)) {
      return res.status(400).json({
        status: false,
        message: 'Role not set. Please call sendOtp with role (employer | job_seeker).'
      });
    }

    const role = user.role;

    // Create profile ONLY if it doesn't exist yet
    let upsertRes;
    if (role === 'employer') {
      upsertRes = await CompanyProfile.updateOne(
        { userId: user._id },
        {
          $setOnInsert: {
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
            pincode: null,
            image: null,
            isDeleted: false
          }
        },
        { upsert: true }
      );
    } else {
      upsertRes = await JobSeekerProfile.updateOne(
        { userId: user._id },
        {
          $setOnInsert: {
            userId: user._id,
            phoneNumber: user.phoneNumber,
            name: null,
            dateOfBirth: null,
            gender: null,
            email: null,
            industryType: null,
            jobProfile: null,
            address: null,
            state: null,
            city: null,
            pincode: null,
            alternatePhoneNumber: null,
            panCardNumber: null,
            image: null,
            isDeleted: false
          }
        },
        { upsert: true }
      );
    }

    // (Optional debug)
    const profileCreated = Boolean(upsertRes?.upsertedCount || upsertRes?.upsertedId);
    if (profileCreated) {
      console.log(`[verifyOtpWebsite] Created ${role} profile for user ${user._id}`);
    } else {
      console.log(`[verifyOtpWebsite] ${role} profile already existed for user ${user._id}`);
    }

    // Generate a fresh token for BOTH new & existing users
    const token = jwt.sign(
      { userId: user._id, phoneNumber: user.phoneNumber, role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // clear OTP & persist token
    user.token = token;
    await user.save();

    // ✅ Response (same for new & existing)
    return res.status(200).json({
      status: true,
      message: 'OTP verified',
      result: { role, token }
    });

  } catch (error) {
    console.error('verifyOtpWebsite error:', error);
    return res.status(500).json({ status: false, message: 'Internal server error' });
  }
};


// logout api for job seeker and employer
exports.logout = async (req, res) => {
  try {
    const { userId } = req.user;
    const token = req.token; 

    const result = await User.updateOne(
      { _id: userId, token },       
      { $set: { token: null } }
    );

    if (result.modifiedCount === 1) {
      return res.status(200).json({ status: true, message: 'Logged out successfully.' });
    }

    // Either already logged out or token mismatch
    return res.status(200).json({ status: true, message: 'Already logged out or session not found.' });
  } catch (error) {
    console.error('logout error:', error);
    return res.status(500).json({ status: false, message: 'Internal server error.' });
  }
};







