const jwt = require("jsonwebtoken");
const Category = require("../models/AdminCategory");
const IndustryType = require("../models/AdminIndustry");
const JobProfile = require("../models/AdminJobProfile");
const User = require('../models/User');

const ADMIN_PHONE = '1234567809';
const STATIC_OTP = '1111';


//Authentication
exports.sendAdminOtp = async (req, res) => {
  const { phoneNumber } = req.body;

  if (phoneNumber !== ADMIN_PHONE) {
    return res.status(403).json({
      status: false,
      message: "Only admin phone number allowed."
    });
  }

  try {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    let user = await User.findOne({ phoneNumber });

    if (!user) {
      user = new User({
        phoneNumber,
        otp: STATIC_OTP,
        otpExpiresAt: expiresAt,
        role: null,         // ✅ Keep it null initially
        token: null
      });
    } else {
      user.otp = STATIC_OTP;
      user.otpExpiresAt = expiresAt;
      // ❌ Don't update role here
    }

    await user.save();

    // return res.json({
    //   otp: STATIC_OTP,
    //   status: true
    // });


     return res.status(200).json({
      status: true,
      message: "OTP sent successfully",
      result: {
        otp: STATIC_OTP
      }
    });


  } catch (error) {
    console.error("Error in sendAdminOtp:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error."
    });
  }
};

exports.verifyAdminOtp = async (req, res) => {
  const { phoneNumber, otp } = req.body;

  if (phoneNumber !== ADMIN_PHONE || otp !== STATIC_OTP) {
    return res.status(401).json({
      status: false,
      message: "Invalid admin credentials."
    });
  }

  try {
    let user = await User.findOne({ phoneNumber });

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "Admin not found. Please send OTP first."
      });
    }

    // Check OTP expiry
    if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
      return res.status(400).json({
        status: false,
        message: "OTP has expired."
      });
    }

    // ✅ Set role to admin now
    user.role = 'admin';

    // ✅ Generate JWT
    const token = jwt.sign(
      {
        userId: user._id,
        phoneNumber: user.phoneNumber,
        role: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    user.token = token;

    // ✅ Save updated user
    await user.save();

    // return res.json({
    //   status: true,
    //   message: 'Admin OTP verified',
    //   role: 'admin',
    //   token
    // });


      return res.status(200).json({
      status: true,
      message: 'Admin OTP verified',
      result: {
        role: 'admin',
        token
      }
    });

    
  } catch (error) {
    console.error('Error in verifyAdminOtp:', error);
    return res.status(500).json({
      status: false,
      message: 'Internal server error'
    });
  }
};

//Category
exports.createCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ status: false, message: "Name required" });
    }

    const category = new Category({ name });
    await category.save();

    // Format response manually
    const formattedCategory = {
      id: category._id,
      name: category.name
    };

    res.status(201).json({
      status: true,
      message: "Category created",
      data: formattedCategory
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      message: "Error creating category",
      error: err.message
    });
  }
};

exports.getCategoryBasedOnRole = async (req, res) => {
  try {
    const { role } = req.user;

    if (!["admin", "employer", "job_seeker"].includes(role)) {
      return res.status(403).json({
        status: false,
        message: "Access denied. Invalid role."
      });
    }

    const categories = await Category.find().sort({ name: 1 }).lean();

    const formattedCategories = categories.map(cat => ({
      id: cat._id,
      name: cat.name
    }));

    return res.status(200).json({
      status: true,
      message: `${role} categories fetched successfully.`,
      data: formattedCategories
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Error fetching categories",
      error: err.message
    });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const updated = await Category.findByIdAndUpdate(id, { name }, { new: true });
    if (!updated) return res.status(404).json({ status: false, message: "Category not found" });

    res.json({ status: true, message: "Updated successfully", data: updated });
  } catch (err) {
    res.status(500).json({ status: false, message: "Error updating category" });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Category.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ status: false, message: "Not found" });

    res.json({ status: true, message: "Category deleted" });
  } catch (err) {
    res.status(500).json({ status: false, message: "Error deleting category" });
  }
};

//Industry Type
exports.createIndustry = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ status: false, message: "Name required" });
    }

    const industry = new IndustryType({ name });
    await industry.save();

    const formattedIndustry = {
      id: industry._id,
      name: industry.name
    };

    res.status(201).json({
      status: true,
      message: "Industry type created",
      data: formattedIndustry
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      message: "Error creating industry",
      error: err.message
    });
  }
};

exports.getIndustryBasedOnRole = async (req, res) => {
  try {
    const { role } = req.user;

    // Optional: restrict access based on role
    if (!["admin", "employer", "job_seeker"].includes(role)) {
      return res.status(403).json({
        status: false,
        message: "Access denied. Invalid role."
      });
    }

    const industries = await IndustryType.find().sort({ name: 1 }).lean();

    const formattedIndustries = industries.map(industry => ({
      id: industry._id,
      name: industry.name
    }));

    return res.status(200).json({
      status: true,
      message: `${role} industries fetched successfully.`,
      data: formattedIndustries
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Error fetching industries",
      error: error.message
    });
  }
};

exports.updateIndustry = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const updated = await IndustryType.findByIdAndUpdate(id, { name }, { new: true });
    if (!updated) return res.status(404).json({ status: false, message: "Industry not found" });

    res.json({ status: true, message: "Updated successfully", data: updated });
  } catch (err) {
    res.status(500).json({ status: false, message: "Error updating industry" });
  }
};

exports.deleteIndustry = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await IndustryType.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ status: false, message: "Not found" });

    res.json({ status: true, message: "Industry deleted" });
  } catch (err) {
    res.status(500).json({ status: false, message: "Error deleting industry" });
  }
};

//Job profile
exports.createProfile = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ status: false, message: "Name required" });
    }

    const profile = new JobProfile({ name });
    await profile.save();

    const formattedProfile = {
      id: profile._id,
      name: profile.name
    };

    res.status(201).json({
      status: true,
      message: "Job profile created",
      data: formattedProfile
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      message: "Error creating profile",
      error: err.message
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const profiles = await JobProfile.find().sort({ name: 1 }).lean();

    const formattedprofiles = profiles.map(profile => ({
      id: profile._id,
      name: profile.name
    }));

    res.status(200).json({
      status: true,
      message: "Job profiles fetched successfully.",
      data: formattedprofiles
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      message: "Error fetching job profiles",
      error: err.message
    });
  }
};


exports.updateProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const updated = await JobProfile.findByIdAndUpdate(id, { name }, { new: true });
    if (!updated) return res.status(404).json({ status: false, message: "Job profile not found" });

    res.json({ status: true, message: "Updated successfully", data: updated });
  } catch (err) {
    res.status(500).json({ status: false, message: "Error updating job profiles" });
  }
};

exports.deleteProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await JobProfile.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ status: false, message: "Not found" });

    res.json({ status: true, message: "Job profile deleted" });
  } catch (err) {
    res.status(500).json({ status: false, message: "Error deleting job profile" });
  }
};





