const mongoose = require("mongoose");
const { Types } = mongoose;

const jwt = require("jsonwebtoken");
const Category = require("../models/AdminCategory");
const IndustryType = require("../models/AdminIndustry");
const Experience = require("../models/AdminExperienceRange");
const JobType = require("../models/AdminJobType");
const JobProfile = require("../models/AdminJobProfile");
const SalaryType = require("../models/AdminSalaryType");
const OtherField = require("../models/AdminOtherField");

const CompanyProfile = require("../models/CompanyProfile");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const FeaturedCompany = require("../models/FeaturedCompany");

const User = require('../models/User');
const JobPost = require("../models/JobPost");

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

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
        role: null,        
        token: null
      });
    } else {
      user.otp = STATIC_OTP;
      user.otpExpiresAt = expiresAt;
     
    }

    await user.save();

   

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

   
    if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
      return res.status(400).json({
        status: false,
        message: "OTP has expired."
      });
    }

   
    user.role = 'admin';

   
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

    
    await user.save();

   

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

    if (!name || !name.trim()) {
      return res.status(400).json({ status: false, message: "Name required" });
    }

    if (!req.file) {
      return res.status(400).json({ status: false, message: "Image file is required." });
    }

    // Build absolute URL for the uploaded image
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const imageUrl = `${baseUrl}/uploads/images/${req.file.filename}`;

    const category = new Category({
      name: name.trim(),
      image: imageUrl
    });

    await category.save();

    const formattedCategory = {
      id: category._id,
      name: category.name,
      image: category.image
    };

    return res.status(201).json({
      status: true,
      message: "Category created",
      data: formattedCategory
    });

  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ status: false, message: "Category name already exists." });
    }
    return res.status(500).json({
      status: false,
      message: "Error creating category",
      error: err.message
    });
  }
};

//get categories of admin
exports.getCategory = async (req, res) => {
  try {
    // pagination params
    const pageRaw  = parseInt(req.query.page, 10);
    const limitRaw = parseInt(req.query.limit, 10);

    const page  = Number.isFinite(pageRaw)  && pageRaw  > 0 ? pageRaw  : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 10;
    const skip  = (page - 1) * limit;

    const filter = { isDeleted: false };

    // 1) Count for pagination
    const totalRecord = await Category.countDocuments(filter);
    const totalPage   = Math.ceil(totalRecord / limit) || 1;

    // 2) Fetch page
    const categories = await Category.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // 3) Shape response
    const data = categories.map(cat => ({
      id: cat._id,
      name: cat.name,
      image: cat.image || null,
      isDeleted: cat.isDeleted
    }));

    // 4) Respond
    return res.status(200).json({
      status: true,
      message: "Categories fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
      data
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

    // 1) Find existing category
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ status: false, message: "Category not found" });
    }

    // 2) Block update if category is already soft deleted
    if (category.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This category is already soft deleted. Update not allowed."
      });
    }

    // 3) Update name only if provided
    if (req.body && typeof req.body.name === "string" && req.body.name.trim()) {
      category.name = req.body.name.trim();
    }

    // 4) If a new image was uploaded, delete old file and set NEW URL
    if (req.file) {
      const uploadDir = path.join(__dirname, "..", "uploads", "images");
      const baseUrl   = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

      // delete old file if present
      if (category.image) {
        const oldFilename = path.basename(category.image);
        const oldPath     = path.join(uploadDir, oldFilename);
        await fsp.unlink(oldPath).catch(err => {
          if (err.code !== "ENOENT") throw err; // ignore 'file not found', rethrow others
        });
      }

      // assign a NEW url based on the newly uploaded file
      category.image = `${baseUrl}/uploads/images/${req.file.filename}`;
    }

    // 5) Save
    await category.save();

    return res.json({
      status: true,
      message: "Updated successfully",
      data: {
        id: category._id,
        name: category.name,
        image: category.image || null,
        isDeleted: category.isDeleted
      }
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Error updating category",
      error: err.message
    });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    // 1) Find the category first
    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        status: false,
        message: "Category not found"
      });
    }

    // 2) Block re-deleting an already soft-deleted category
    if (category.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This category is already soft deleted."
      });
    }

    // 3) Soft delete
    category.isDeleted = true;
    await category.save();

    return res.json({
      status: true,
      message: "Category soft deleted successfully",
      data: {
        id: category._id,
        name: category.name,
        isDeleted: category.isDeleted
      }
    });

  } catch (err) {
    console.error("Error soft deleting category:", err);
    return res.status(500).json({
      status: false,
      message: "Error soft deleting category",
      error: err.message
    });
  }
};

//get for employer and job seeker
exports.getCategoryBasedOnRole = async (req, res) => {
  try {
    const { role } = req.user;

    if (!["employer", "job_seeker"].includes(role)) {
      return res.status(403).json({
        status: false,
        message: "Access denied. Invalid role."
      });
    }

    // pagination params
    const pageRaw  = parseInt(req.query.page, 10);
    const limitRaw = parseInt(req.query.limit, 10);

    const page  = Number.isFinite(pageRaw)  && pageRaw  > 0 ? pageRaw  : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 10;
    const skip  = (page - 1) * limit;

    // only non-deleted categories
    const filter = { isDeleted: false };

    // 1) Count for pagination
    const totalRecord = await Category.countDocuments(filter);
    const totalPage   = Math.ceil(totalRecord / limit) || 1;

    // 2) Fetch page
    const categories = await Category.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // 3) Shape response (keep same fields as your original)
    const data = categories.map(cat => ({
      id: cat._id,
      name: cat.name,
         image: cat.image || null,
      isDeleted: !!cat.isDeleted
      
    }));

    // 4) Respond
    return res.status(200).json({
      status: true,
      message: `${role} categories fetched successfully.`,
      totalRecord,
      totalPage,
      currentPage: page,
      data
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Error fetching categories",
      error: err.message
    });
  }
};

//get all categories without token


// exports.getAllCategoriesPublic = async (req, res) => {
//   try {
//     // Pagination
//     const page  = Number.parseInt(req.query.page, 10) || 1;
//     const limit = Number.parseInt(req.query.limit, 10) || 10;
//     const skip  = (page - 1) * limit;

//     // Only non-deleted categories
//     const filter = { isDeleted: false };

//     // Count (only non-deleted)
//     const totalRecord = await Category.countDocuments(filter);
//     const totalPage   = Math.max(1, Math.ceil(totalRecord / limit));

//     // Fetch page
//     const categories = await Category.find(filter)
//       .select("_id name image isDeleted")
//       .sort({ name: 1 })
//       .skip(skip)
//       .limit(limit)
//       .lean();

//     // Shape response
//     const data = categories.map(c => ({
//       id: c._id,
//       name: c.name,
//       image: c.image || null,
//       isDeleted: !!c.isDeleted
//     }));

//     // Respond
//     return res.status(200).json({
//       status: true,
//       message: "Categories fetched successfully.",
//       totalRecord,
//       totalPage,
//       currentPage: page,
//       data
//     });
//   } catch (error) {
//     console.error("Error fetching public categories:", error);
//     return res.status(500).json({
//       status: false,
//       message: "Failed to fetch categories.",
//       error: error.message
//     });
//   }
// };

exports.getAllCategoriesPublic = async (req, res) => {
  try {
    // pagination
    const page  = Number.parseInt(req.query.page, 10)  || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 10;
    const skip  = (page - 1) * limit;

    // only non-deleted categories
    const filter = { isDeleted: false };

    // 1) Count (only non-deleted)
    const totalRecord = await Category.countDocuments(filter);
    const totalPage   = Math.max(1, Math.ceil(totalRecord / limit));

    // 2) Fetch page
    const categories = await Category.find(filter)
      .select("_id name image isDeleted")
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // 3) Build job counts for this page (active + non-deleted jobs)
    const categoryIds = categories.map(c => c._id);
    const countMap = {};

    await Promise.all(
      categoryIds.map(async (id) => {
        const n = await JobPost.countDocuments({
          isDeleted: false,
          status: "active",          // only active jobs
          category: id
          // If your system doesn't flip status to "expired" automatically,
          // also enforce: expiredDate: { $gt: new Date() }
        });
        countMap[id.toString()] = n;
      })
    );

    // 4) Shape response
    const data = categories.map(c => ({
      id: c._id,
      name: c.name,
      image: c.image || null,
      isDeleted: !!c.isDeleted,
      jobCount: countMap[c._id.toString()] || 0
    }));

    // 5) Respond
    return res.status(200).json({
      status: true,
      message: "Categories fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
      data
    });

  } catch (error) {
    console.error("Error fetching public categories:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch categories.",
      error: error.message
    });
  }
};


exports.getJobPostsByCategoryPublic = async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Validate categoryId
    if (!Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid categoryId.",
      });
    }

    // Ensure category exists
    const catExists = await Category.exists({ _id: categoryId });
    if (!catExists) {
      return res.status(404).json({
        status: false,
        message: "Category not found.",
      });
    }

    // Pagination
    const page  = parseInt(req.query.page, 10)  || 1;
    const limit = parseInt(req.query.limit, 10) || 5;
    const skip  = (page - 1) * limit;

    // Filter only by category (add your own public filters if needed)
    const filter = { category: categoryId };

    // Count & fetch
    const totalRecord = await JobPost.countDocuments(filter);
    const totalPage   = Math.ceil(totalRecord / limit);

    const jobPosts = await JobPost.find(filter)
      .select("-createdAt -updatedAt -__v")
      .populate({ path: "companyId",    select: "companyName image" })
      .populate({ path: "category",     select: "name" })
      .populate({ path: "industryType", select: "name" })
      .populate({ path: "state",        select: "state" })
      .populate({ path: "salaryType",   select: "name label title value" }) // added
      .populate({ path: "jobType",      select: "name label title value" }) // added
      .populate({ path: "experience",   select: "name range label" })       // added
      .populate({ path: "otherField",   select: "name label title" })       // added
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Generic display-name picker for referenced docs
    const pickDisplay = (doc) => {
      if (!doc) return null;
      return (
        doc.name ??
        doc.label ??
        doc.title ??
        doc.range ??
        doc.value ??
        null
      );
    };

    const data = jobPosts.map((j) => ({
      _id: j._id,
      company: j.companyId?.companyName ?? null,
      companyImage: j.companyId?.image ?? null,
      category: j.category?.name ?? null,
      industryType: j.industryType?.name ?? null,
      jobTitle: j.jobTitle,
      jobDescription: j.jobDescription,
      salaryType: pickDisplay(j.salaryType), // now human-readable
      displayPhoneNumber: j.displayPhoneNumber,
      displayEmail: j.displayEmail,
      jobType: pickDisplay(j.jobType),       // now human-readable
      skills: j.skills,
      minSalary: j.minSalary,
      maxSalary: j.maxSalary,
      state: j.state?.state ?? null,
      experience: pickDisplay(j.experience), // now human-readable
      otherField: pickDisplay(j.otherField), // now human-readable
      status: j.status,
      expiredDate: j.expiredDate,
      isDeleted: j.isDeleted,
    }));

    return res.status(200).json({
      status: true,
      message: "Job posts fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
      data,
    });
  } catch (error) {
    console.error("Error fetching jobs by category:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch job posts.",
      error: error.message,
    });
  }
};

//industry type
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

// get industry for admin
exports.getIndustry = async (req, res) => {
  try {
    const page  = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip  = (page - 1) * limit;

    // ✅ Only fetch industries that are not deleted
    const filter = { isDeleted: false };

    // Count total records (excluding deleted)
    const totalRecord = await IndustryType.countDocuments(filter);
    const totalPage   = Math.ceil(totalRecord / limit);

    // Fetch with pagination
    const industries = await IndustryType.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Format response
    const formattedIndustries = industries.map(industry => ({
      id: industry._id,
      name: industry.name,
      isDeleted: industry.isDeleted
    }));

    return res.status(200).json({
      status: true,
      message: "Industry types fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
      data: formattedIndustries
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Error fetching industry types.",
      error: err.message
    });
  }
};

//get industry for employer and job seeker
exports.getIndustryBasedOnRole = async (req, res) => {
  try {
    const { role } = req.user;

    if (!["employer", "job_seeker"].includes(role)) {
      return res.status(403).json({
        status: false,
        message: "Access denied. Invalid role."
      });
    }

    // pagination params
    const page  = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip  = (page - 1) * limit;

    // only non-deleted industries
    const filter = { isDeleted: false };

    // count for pagination
    const totalRecord = await IndustryType.countDocuments(filter);
    const totalPage   = Math.ceil(totalRecord / limit);

    // fetch page
    const industries = await IndustryType.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // shape response
    const data = industries.map(industry => ({
      id: industry._id,
      name: industry.name
    }));

    return res.status(200).json({
      status: true,
      message: `${role} industries fetched successfully.`,
      totalRecord,
      totalPage,
      currentPage: page,
      data
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

    // 1) Find the industry first
    const industry = await IndustryType.findById(id);

    if (!industry) {
      return res.status(404).json({ status: false, message: "Industry not found" });
    }

    // 2) Block update if already soft-deleted
    if (industry.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This industry is already soft deleted. Update not allowed."
      });
    }

    // 3) Update name only if provided
    if (name && name.trim()) {
      industry.name = name.trim();
    }

    await industry.save();

    return res.json({
      status: true,
      message: "Updated successfully",
      data: {
        id: industry._id,
        name: industry.name,
        isDeleted: industry.isDeleted
      }
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Error updating industry",
      error: err.message
    });
  }
};

exports.deleteIndustry = async (req, res) => {
  try {
    const { id } = req.params;

    // 1) Find industry
    const industry = await IndustryType.findById(id);

    if (!industry) {
      return res.status(404).json({
        status: false,
        message: "Industry not found"
      });
    }

    // 2) If already soft-deleted → block re-deletion
    if (industry.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This industry is already soft deleted."
      });
    }

    // 3) Soft delete (set flag true)
    industry.isDeleted = true;
    await industry.save();

    return res.json({
      status: true,
      message: "Industry soft deleted successfully"
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Error deleting industry",
      error: err.message
    });
  }
};

//get industries without token
exports.getAllIndustriesPublic = async (req, res) => {
  try {
    const page  = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip  = (page - 1) * limit;

    const filter = { isDeleted: false }; // ✅ exclude soft-deleted

    // 1) Count for pagination
    const totalRecord = await IndustryType.countDocuments(filter);
    const totalPage   = Math.ceil(totalRecord / limit);

    // 2) Fetch industries (sorted A→Z, only not deleted)
    const industries = await IndustryType.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // 3) Shape response
    const data = industries.map(ind => ({
      id: ind._id,
      name: ind.name,
      isDeleted: ind.isDeleted  // optional → remove if you don’t want to expose
    }));

    // 4) Respond
    return res.status(200).json({
      status: true,
      message: "Industry types fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
      data
    });
  } catch (error) {
    console.error("Error fetching public industry types:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch industry types.",
      error: error.message
    });
  }
};

//Job profile
exports.createProfile = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ status: false, message: "Name required" });
    }

    const profile = new JobProfile({ name: name.trim() });
    await profile.save();

    res.status(201).json({
      status: true,
      message: "Job profile created",
      data: {
        id: profile._id,
        name: profile.name,
        isDeleted: profile.isDeleted   // <- will be false
      }
    });
  } catch (err) {
    // optional: handle duplicate key nicely
    if (err?.code === 11000) {
      return res.status(409).json({ status: false, message: "Job profile name already exists." });
    }
    res.status(500).json({
      status: false,
      message: "Error creating profile",
      error: err.message
    });
  }
};

//get job profile of admin
exports.getProfile = async (req, res) => {
  try {
    const page  = parseInt(req.query.page, 10)  || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip  = (page - 1) * limit;

    const filter = { isDeleted: false };

    // 1) Count
    const totalRecord = await JobProfile.countDocuments(filter);
    const totalPage   = Math.ceil(totalRecord / limit);

    // 2) Page
    const profiles = await JobProfile.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // 3) Shape
    const data = profiles.map(p => ({
      id: p._id,
      name: p.name,
      isDeleted: p.isDeleted // optional, remove if you don't want to expose it
    }));

    // 4) Respond
    return res.status(200).json({
      status: true,
      message: "Job profiles fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
      data
    });
  } catch (err) {
    return res.status(500).json({
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

    // 1) Find existing profile
    const profile = await JobProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ status: false, message: "Job profile not found" });
    }

    // 2) Check if already soft-deleted
    if (profile.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This job profile is already soft deleted and cannot be updated."
      });
    }

    // 3) Update if valid
    if (name && name.trim()) {
      profile.name = name.trim();
    }

    await profile.save();

    return res.json({
      status: true,
      message: "Updated successfully",
      data: profile
    });

  } catch (err) {
    console.error("Error updating job profile:", err);
    res.status(500).json({ status: false, message: "Error updating job profile", error: err.message });
  }
};

exports.deleteProfile = async (req, res) => {
  try {
    const { id } = req.params;

    // 1) Find the profile first
    const profile = await JobProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ status: false, message: "Job profile not found" });
    }

    // 2) If already soft-deleted, block the request
    if (profile.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This job profile is already soft deleted."
      });
    }

    // 3) Soft delete (mark isDeleted = true)
    profile.isDeleted = true;
    await profile.save();

    return res.json({
      status: true,
      message: "Job profile soft deleted successfully"
    });

  } catch (err) {
    console.error("Error soft deleting job profile:", err);
    return res.status(500).json({
      status: false,
      message: "Error soft deleting job profile",
      error: err.message
    });
  }
};

//get job profile for job seeker
exports.getJobProfileBasedOnRole = async (req, res) => {
  try {
    // verifyToken + verifyJobSeekerOnly already ran
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    // ✅ Only fetch non-deleted profiles
    const query = { isDeleted: false };

    const [totalRecord, rows] = await Promise.all([
      JobProfile.countDocuments(query),
      JobProfile.find(query)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    const data = rows.map(p => ({
      id: p._id,
      name: p.name,
      isDeleted: p.isDeleted   // optional, can remove if you don't want to return it
    }));

    return res.status(200).json({
      status: true,
      message: data.length
        ? "Job profiles fetched successfully."
        : "No job profiles found.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit) || 0,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("getJobProfileBasedOnRole error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message
    });
  }
};


// exports.getJobProfileBasedOnRole = async (req, res) => {
//   try {
//     // verifyToken + verifyJobSeekerOnly already ran
//     const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
//     const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

//     const [totalRecord, rows] = await Promise.all([
//       JobProfile.countDocuments({}),
//       JobProfile.find({})
//         .sort({ name: 1 })
//         .skip((page - 1) * limit)
//         .limit(limit)
//         .lean()
//     ]);

//     const data = rows.map(p => ({ id: p._id, name: p.name }));

//     return res.status(200).json({
//       status: true,
//       message: data.length
//         ? "Job profiles fetched successfully."
//         : "No job profiles found.",
//       totalRecord,
//       totalPage: Math.ceil(totalRecord / limit) || 0,
//       currentPage: page,
//       data
//     });
//   } catch (err) {
//     console.error("getJobProfileBasedOnRole error:", err);
//     return res.status(500).json({
//       status: false,
//       message: "Server error.",
//       error: err.message
//     });
//   }
// };



//experience range
const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


exports.createExperience = async (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    if (!name) {
      return res.status(400).json({ status: false, message: "name is required" });
    }

    // Find by case-insensitive name (any doc, deleted or not)
    const existing = await Experience.findOne({
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" }
    });

    if (existing) {
      if (existing.isDeleted) {
        // Restore soft-deleted doc
        existing.isDeleted = false;
        existing.name = name; // normalize casing/spacing
        await existing.save();
        return res.status(200).json({
          status: true,
          message: "Experience range restored successfully.",
          data: existing
        });
      }
      // Already active
      return res.status(409).json({
        status: false,
        message: "Experience range already exists"
      });
    }

    const doc = await Experience.create({ name });
    return res.status(201).json({
      status: true,
      message: "Experience range created successfully.",
      data: doc
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ status: false, message: "Experience range already exists" });
    }
    console.error("createExperience error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

exports.updateExperience = async (req, res) => {
  try {
    const { id } = req.body || {};
    const name = (req.body?.name || "").trim();

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid id is required" });
    }
    if (!name) {
      return res.status(400).json({ status: false, message: "name is required" });
    }

    const doc = await Experience.findById(id);
    if (!doc) {
      return res.status(404).json({ status: false, message: "Experience range not found" });
    }

    // ❌ Block updates on soft-deleted docs
    if (doc.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This job profile is already soft deleted and cannot be updated."
      });
    }

    // Prevent duplicate name (case-insensitive) among non-deleted docs
    const dupe = await Experience.findOne({
      _id: { $ne: id },
      isDeleted: false,
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" }
    });
    if (dupe) {
      return res.status(409).json({
        status: false,
        message: "Another experience range with this name already exists"
      });
    }

    doc.name = name;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Experience range updated successfully.",
      data: doc
    });
  } catch (err) {
    console.error("updateExperience error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

//get experience of admin
exports.getExperience = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const filter = { isDeleted: false };

    const [totalRecord, data] = await Promise.all([
      Experience.countDocuments(filter),
      Experience.find(filter)
        .sort({ createdAt: -1, _id: 1 }) // stable internal order
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    return res.status(200).json({
      status: true,
      message: "Experience ranges fetched successfully.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit) || 0,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("listExperience error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

exports.deleteExperience = async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        status: false,
        message: "Valid id is required"
      });
    }

    const doc = await Experience.findById(id);

    if (!doc) {
      return res.status(404).json({
        status: false,
        message: "Experience range not found"
      });
    }

    // 🚫 Already soft deleted
    if (doc.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This experience is already soft deleted."
      });
    }

    // ✅ Soft delete now
    doc.isDeleted = true;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Experience range deleted successfully."
    });

  } catch (err) {
    console.error("deleteExperience error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};

//get experience for employer 
exports.getExperienceRangeBasedOnRole = async (req, res) => {
  try {
    // verifyToken + verifyEmployerOnly already enforced at the route
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const filter = { isDeleted: false };

    const [totalRecord, rows] = await Promise.all([
      Experience.countDocuments(filter),
      Experience.find(filter)
        .sort({ createdAt: -1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    const data = rows.map(x => ({ id: x._id, name: x.name }));

    return res.status(200).json({
      status: true,
      message: data.length
        ? "Experience ranges fetched successfully."
        : "No experience ranges found.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit) || 0,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("getExperienceForEmployer error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message
    });
  }
};


//job types
exports.createJobType = async (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ status: false, message: "name is required" });

    // find any by case-insensitive name
    const existing = await JobType.findOne({
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" }
    });

    if (existing) {
      if (existing.isDeleted) {
        // restore soft-deleted
        existing.isDeleted = false;
        existing.name = name; // normalize casing/spacing
        await existing.save();
        return res.status(200).json({
          status: true,
          message: "Job type restored successfully.",
          data: existing
        });
      }
      return res.status(409).json({ status: false, message: "Job type already exists" });
    }

    const doc = await JobType.create({ name });
    return res.status(201).json({
      status: true,
      message: "Job type created successfully.",
      data: doc
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ status: false, message: "Job type already exists" });
    }
    console.error("createJobType error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

exports.updateJobType = async (req, res) => {
  try {
    const { id } = req.body || {};
    const name = (req.body?.name || "").trim();

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid id is required" });
    }
    if (!name) {
      return res.status(400).json({ status: false, message: "name is required" });
    }

    const doc = await JobType.findById(id);

    if (!doc) {
      return res.status(404).json({ status: false, message: "Job type not found" });
    }

    // ❌ Safeguard: prevent updates if already soft deleted
    if (doc.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This job type is already soft deleted and cannot be updated."
      });
    }

    // duplicate guard among active docs
    const dupe = await JobType.findOne({
      _id: { $ne: id },
      isDeleted: false,
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" }
    });
    if (dupe) {
      return res.status(409).json({
        status: false,
        message: "Another job type with this name already exists"
      });
    }

    doc.name = name;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Job type updated successfully.",
      data: doc
    });
  } catch (err) {
    console.error("updateJobType error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

//get job type for admin
exports.getJobTypes = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const filter = { isDeleted: false };

    const [totalRecord, data] = await Promise.all([
      JobType.countDocuments(filter),
      JobType.find(filter)
        .sort({ createdAt: -1, _id: 1 }) // stable internal order
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    return res.status(200).json({
      status: true,
      message: "Job types fetched successfully.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit) || 0,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("listJobTypes error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

exports.deleteJobType = async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid id is required" });
    }

    const doc = await JobType.findById(id);

    if (!doc) {
      return res.status(404).json({ status: false, message: "Job type not found" });
    }

    // ❌ Already soft-deleted → block with 400 (your requested message)
    if (doc.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This job profile is already soft deleted."
      });
    }

    // ✅ Soft delete
    doc.isDeleted = true;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Job type deleted successfully."
    });
  } catch (err) {
    console.error("deleteJobType error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

//get job type for employer and job seeker
exports.getJobTypeBasedOnRole = async (req, res) => {
  try {
    const role = req.user?.role;
    if (role !== "employer" && role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Employers and Job seekers only."
      });
    }

    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const filter = { isDeleted: false };
    const [totalRecord, rows] = await Promise.all([
      JobType.countDocuments(filter),
      JobType.find(filter)
        .sort({ createdAt: -1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    const data = rows.map(j => ({ id: j._id, name: j.name }));

    return res.status(200).json({
      status: true,
      message: data.length ? "Job types fetched successfully." : "No job types found.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit) || 0,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("getJobTypeBasedOnRole error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};


//salary types
exports.createSalaryType = async (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ status: false, message: "name is required" });

    // case-insensitive find (even if soft-deleted)
    const existing = await SalaryType.findOne({
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" }
    });

    if (existing) {
      if (existing.isDeleted) {
        // restore soft-deleted
        existing.isDeleted = false;
        existing.name = name; // normalize casing/spacing
        await existing.save();
        return res.status(200).json({
          status: true,
          message: "Salary type restored successfully.",
          data: existing
        });
      }
      return res.status(409).json({ status: false, message: "Salary type already exists" });
    }

    const doc = await SalaryType.create({ name });
    return res.status(201).json({
      status: true,
      message: "Salary type created successfully.",
      data: doc
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ status: false, message: "Salary type already exists" });
    }
    console.error("createSalaryType error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};


exports.updateSalaryType = async (req, res) => {
  try {
    const { id } = req.body || {};
    const name = (req.body?.name || "").trim();

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid id is required" });
    }
    if (!name) {
      return res.status(400).json({ status: false, message: "name is required" });
    }

    const doc = await SalaryType.findById(id);
    if (!doc) {
      return res.status(404).json({ status: false, message: "Salary type not found" });
    }

    // ❌ Block updates on soft-deleted docs
    if (doc.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This salary type is already soft deleted and cannot be updated."
      });
    }

    // Duplicate guard among active docs (case-insensitive exact match)
    const dupe = await SalaryType.findOne({
      _id: { $ne: id },
      isDeleted: false,
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" }
    });
    if (dupe) {
      return res.status(409).json({
        status: false,
        message: "Another salary type with this name already exists"
      });
    }

    doc.name = name;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Salary type updated successfully.",
      data: {
        id: doc._id,
        name: doc.name,
        isDeleted: doc.isDeleted
      }
    });
  } catch (err) {
    console.error("updateSalaryType error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};



//get salary type for admin
exports.getSalaryTypes = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const filter = { isDeleted: false };

    const [totalRecord, data] = await Promise.all([
      SalaryType.countDocuments(filter),
      SalaryType.find(filter)
        .sort({ createdAt: -1, _id: 1 }) // stable internal order
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    return res.status(200).json({
      status: true,
      message: "Salary types fetched successfully.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit) || 0,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("listSalaryTypes error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

exports.deleteSalaryType = async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        status: false,
        message: "Valid id is required"
      });
    }

    const doc = await SalaryType.findById(id);

    if (!doc) {
      return res.status(404).json({
        status: false,
        message: "Salary type not found"
      });
    }

    // 🚫 Already soft deleted
    if (doc.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This is already soft deleted."
      });
    }

    // ✅ Soft delete
    doc.isDeleted = true;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Salary type deleted successfully."
    });

  } catch (err) {
    console.error("deleteSalaryType error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};

//get salary types for employer and job seeker
exports.getSalaryTypeBasedOnRole = async (req, res) => {
  try {
    const role = req.user?.role;
    if (role !== "employer" && role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Employers and Job seekers only."
      });
    }

    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const filter = { isDeleted: false };

    const [totalRecord, rows] = await Promise.all([
      SalaryType.countDocuments(filter),
      SalaryType.find(filter)
        .sort({ createdAt: -1, _id: 1 }) // stable order
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    const data = rows.map(s => ({ id: s._id, name: s.name }));

    return res.status(200).json({
      status: true,
      message: data.length ? "Salary types fetched successfully." : "No salary types found.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit) || 0,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("getSalaryTypesBasedOnRole error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};



//other field
exports.createOtherField = async (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ status: false, message: "name is required" });

    // find by name (case-insensitive), even if soft-deleted
    const existing = await OtherField.findOne({
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" }
    });

    if (existing) {
      if (existing.isDeleted) {
        // restore soft-deleted record
        existing.isDeleted = false;
        existing.name = name; // normalize casing/spacing
        await existing.save();
        return res.status(200).json({
          status: true,
          message: "Other field restored successfully.",
          data: existing
        });
      }
      return res.status(409).json({ status: false, message: "Other field already exists" });
    }

    const doc = await OtherField.create({ name });
    return res.status(201).json({
      status: true,
      message: "Other field created successfully.",
      data: doc
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ status: false, message: "Other field already exists" });
    }
    console.error("createOtherField error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

exports.updateOtherField = async (req, res) => {
  try {
    const { id } = req.body || {};
    const name = (req.body?.name || "").trim();

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid id is required" });
    }
    if (!name) {
      return res.status(400).json({ status: false, message: "Name is required" });
    }

    const doc = await OtherField.findById(id);

    if (!doc) {
      return res.status(404).json({ status: false, message: "Other field not found" });
    }

    // 🚨 block updates on soft-deleted records
    if (doc.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This other field is already soft deleted and cannot be updated."
      });
    }

    doc.name = name;

    try {
      await doc.save(); // may throw E11000 duplicate key error
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          status: false,
          message: "Another other field with this name already exists"
        });
      }
      throw err;
    }

    return res.status(200).json({
      status: true,
      message: "Other field updated successfully.",
      data: {
        id: doc._id,
        name: doc.name,
        isDeleted: doc.isDeleted
      }
    });
  } catch (err) {
    console.error("updateOtherField error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};

exports.deleteOtherField = async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid id is required" });
    }

    const doc = await OtherField.findById(id);

    if (!doc) {
      return res.status(404).json({ status: false, message: "Other field not found" });
    }

    if (doc.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This is already soft deleted."
      });
    }

    doc.isDeleted = true;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Other field soft deleted successfully."
    });
  } catch (err) {
    console.error("deleteOtherField error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};

//get for admin
exports.getOtherField = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const filter = { isDeleted: false };

    const [totalRecord, data] = await Promise.all([
      OtherField.countDocuments(filter),
      OtherField.find(filter)
        .sort({ createdAt: -1, _id: 1 }) // stable internal order
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    return res.status(200).json({
      status: true,
      message: "Other fields fetched successfully.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit) || 0,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("listOtherFields error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

//get for employer
exports.getOtherFieldBasedOnRole = async (req, res) => {
  try {
    // verifyToken + verifyEmployerOnly already run at the route
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const filter = { isDeleted: false };

    const [totalRecord, rows] = await Promise.all([
      OtherField.countDocuments(filter),
      OtherField.find(filter)
        .sort({ createdAt: -1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    const data = rows.map(o => ({ id: o._id, name: o.name }));

    return res.status(200).json({
      status: true,
      message: data.length
        ? "Other fields fetched successfully."
        : "No other fields found.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit) || 0,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("getOtherFieldsForEmployer error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message
    });
  }
};

//get companies list for admin
exports.getCompanyProfiles = async (req, res) => {
  try {
    const page  = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip  = (page - 1) * limit;

    // Count only non-deleted
    const totalRecord = await CompanyProfile.countDocuments({ isDeleted: false });

    // Fetch only non-deleted
    const companies = await CompanyProfile.find({ isDeleted: false })
      .populate("industryType", "name")
      .populate("state", "state")
      .sort({ createdAt: -1 }) // fixed sort: newest first
      .skip(skip)
      .limit(limit)
      .lean();

    if (!companies || companies.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No company profiles found."
      });
    }

    const data = companies.map(company => ({
      id: company._id,
      userId: company.userId,
      phoneNumber: company.phoneNumber,
      companyName: company.companyName,
      industryType: company.industryType?.name || null,
      contactPersonName: company.contactPersonName,
      panCardNumber: company.panCardNumber,
      gstNumber: company.gstNumber,
      alternatePhoneNumber: company.alternatePhoneNumber,
      email: company.email,
      companyAddress: company.companyAddress,
      state: company.state?.state || null,
      city: company.city,
      pincode: company.pincode,
      image: company.image
    }));

    return res.status(200).json({
      status: true,
      message: "Company profiles fetched successfully.",
      totalRecord,
      currentPage: page,
      totalPages: Math.ceil(totalRecord / limit),
      data
    });
  } catch (error) {
    console.error("getCompanyProfiles error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};


//get job seeker list for admin
exports.getJobSeekerProfiles = async (req, res) => {
  try {
    const page  = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip  = (page - 1) * limit;

    // Count only non-deleted
    const totalRecord = await JobSeekerProfile.countDocuments({ isDeleted: false });

    // Fetch only non-deleted
    const seeker = await JobSeekerProfile.find({ isDeleted: false })
      .populate("jobProfile", "name")
      .populate("industryType", "name")
      .populate("state", "state")
      .sort({ createdAt: -1 }) // fixed sort: newest first
      .skip(skip)
      .limit(limit)
      .lean();

    if (!seeker || seeker.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No job seeker profiles found."
      });
    }

    const data = seeker.map(seeker => ({
      id: seeker._id,
      userId: seeker.userId,
      phoneNumber: seeker.phoneNumber,
      jobSeekerName: seeker.name,
      industryType: seeker.industryType?.name || null,
       jobprofile: seeker.jobProfile?.name || null,
      dateOfBirth: seeker.dateOfBirth,
      panCardNumber: seeker.panCardNumber,
      gender: seeker.gender,
      alternatePhoneNumber: seeker.alternatePhoneNumber,
      email: seeker.email,
      jobSeekerAddress: seeker.address,
      state: seeker.state?.state || null,
      city: seeker.city,
      pincode: seeker.pincode,
      image: seeker.image
    }));

    return res.status(200).json({
      status: true,
      message: "Job seeker profiles fetched successfully.",
      totalRecord,
      currentPage: page,
      totalPages: Math.ceil(totalRecord / limit),
      data
    });
  } catch (error) {
    console.error("getJobSeekerProfiles error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};

//featured companies
exports.addFeaturedCompanies = async (req, res) => {
  try {
    const { companyId, orderNo } = req.body || {};

    // Basic validation
    if (!companyId || !mongoose.isValidObjectId(companyId)) {
      return res.status(400).json({ status: false, message: "Valid companyId is required." });
    }
    const orderNoNum = parseInt(orderNo, 10);
    if (!Number.isFinite(orderNoNum)) {
      return res.status(400).json({ status: false, message: "Valid orderNo is required." });
    }

    // Make sure the source company exists and is not soft-deleted
    const company = await CompanyProfile.findOne({ _id: companyId, isDeleted: false })
      .populate("industryType", "name")
      .populate("state", "state")
      .lean();

    if (!company) {
      return res.status(404).json({
        status: false,
        message: "Company not found or is soft-deleted."
      });
    }

    // Prevent duplicate active featured for the same company
    const existingActive = await FeaturedCompany.findOne({ companyId, isDeleted: false }).lean();
    if (existingActive) {
      return res.status(409).json({
        status: false,
        message: "This company is already featured."
      });
    }

    // Ensure orderNo is unique among active featured items
    const orderClash = await FeaturedCompany.findOne({ orderNo: orderNoNum, isDeleted: false }).lean();
    if (orderClash) {
      return res.status(409).json({
        status: false,
        message: `Order number ${orderNoNum} is already in use.`
      });
    }

    // If there is a soft-deleted record for the same company, revive it (optional convenience)
    let doc = await FeaturedCompany.findOne({ companyId }).exec();
    if (doc && doc.isDeleted === true) {
      doc.orderNo = orderNoNum;
      doc.isDeleted = false;
      await doc.save();
    } else if (!doc) {
      doc = await FeaturedCompany.create({
        companyId,
        orderNo: orderNoNum
      });
    }

    // Build response with full company details + chosen order number
    return res.status(201).json({
      status: true,
      message: "Featured company added.",
      data: {
        id: doc._id,
        orderNo: doc.orderNo,
        isDeleted: doc.isDeleted,
        companyId: company._id,
        userId: company.userId,
        phoneNumber: company.phoneNumber,
        companyName: company.companyName,
        industryType: company.industryType?.name || null,
        contactPersonName: company.contactPersonName,
        panCardNumber: company.panCardNumber,
        gstNumber: company.gstNumber,
        alternatePhoneNumber: company.alternatePhoneNumber,
        email: company.email,
        companyAddress: company.companyAddress,
        state: company.state?.state || null,
        city: company.city,
        pincode: company.pincode,
        image: company.image,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      }
    });
  } catch (err) {
    console.error("addFeaturedCompany error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

//for admin only
exports.getFeaturedCompanies = async (req, res) => {
  try {
    const page  = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip  = (page - 1) * limit;

    const result = await FeaturedCompany.aggregate([
      { $match: { isDeleted: false } }, // only active featured rows

      // Join company details
      {
        $lookup: {
          from: "companyprofiles", // adjust if your collection name differs
          localField: "companyId",
          foreignField: "_id",
          as: "company"
        }
      },
      { $unwind: "$company" },

      // Exclude companies that are soft-deleted
      { $match: { "company.isDeleted": false } },

      // Join state (optional, for readable name)
      {
        $lookup: {
          from: "states",
          localField: "company.state",
          foreignField: "_id",
          as: "stateDoc"
        }
      },

      // Derive stateName and null-safe aboutCompany
      {
        $addFields: {
          stateName: { $ifNull: [{ $arrayElemAt: ["$stateDoc.state", 0] }, null] },
          aboutCompany: { $ifNull: ["$company.aboutCompany", null] }
        }
      },

      // Only keep fields we want to return
      {
        $project: {
          _id: 1,
          orderNo: 1,
          isDeleted: 1,
          createdAt: 1,
          updatedAt: 1,
          stateName: 1,
          aboutCompany: 1,
          "company._id": 1,
          "company.companyName": 1,
          "company.companyAddress": 1,
          "company.city": 1,
          "company.pincode": 1,
          "company.image": 1
          // Note: userId/phoneNumber intentionally excluded
        }
      },

      // Sort, then paginate with total
      { $sort: { orderNo: 1, createdAt: 1 } },
      {
        $facet: {
          meta: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: limit }]
        }
      }
    ]);

    const totalRecord = result?.[0]?.meta?.[0]?.total || 0;
    const rows = result?.[0]?.data || [];

    if (rows.length === 0) {
      return res.status(404).json({ status: false, message: "No featured companies found." });
    }

    const data = rows.map(doc => ({
      id: doc._id,
      orderNo: doc.orderNo,
      isDeleted: doc.isDeleted,

      companyId: doc.company._id,
      companyName: doc.company.companyName,
      aboutCompany: doc.aboutCompany,              // ✅ included, null-safe
      companyAddress: doc.company.companyAddress,
      state: doc.stateName,
      city: doc.company.city,
      pincode: doc.company.pincode,
      image: doc.company.image,

      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));

    return res.status(200).json({
      status: true,
      message: "Featured companies fetched successfully.",
      totalRecord,
      currentPage: page,
      totalPages: Math.ceil(totalRecord / limit),
      data
    });
  } catch (err) {
    console.error("getFeaturedCompanies error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};


exports.deleteFeaturedCompanies = async (req, res) => {
  try {
    const { id } = req.body || {};

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        status: false,
        message: "Valid id is required."
      });
    }

    const doc = await FeaturedCompany.findById(id);
    if (!doc) {
      return res.status(404).json({
        status: false,
        message: "Featured company not found."
      });
    }

    if (doc.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This is already soft deleted."
      });
    }

    doc.isDeleted = true;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Featured company soft deleted successfully."
    });
  } catch (err) {
    console.error("deleteFeaturedCompanies error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message
    });
  }
};

exports.updateFeaturedCompanies = async (req, res) => {
  try {
    const { id, companyId, orderNo } = req.body || {};

    // Basic validation
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid id is required." });
    }
    if (!companyId || !mongoose.isValidObjectId(companyId)) {
      return res.status(400).json({ status: false, message: "Valid companyId is required." });
    }
    const orderNoNum = parseInt(orderNo, 10);
    if (!Number.isFinite(orderNoNum)) {
      return res.status(400).json({ status: false, message: "Valid orderNo is required." });
    }

    // Fetch the featured row
    const doc = await FeaturedCompany.findById(id);
    if (!doc) {
      return res.status(404).json({ status: false, message: "Featured company not found." });
    }

    // Soft-deleted rows cannot be updated
    if (doc.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This is already soft deleted."
      });
    }

    // Ensure the provided companyId matches the record
    if (String(doc.companyId) !== String(companyId)) {
      return res.status(400).json({
        status: false,
        message: "companyId does not match the featured record."
      });
    }

    // Avoid order number collision among active featured items
    const clash = await FeaturedCompany.findOne({
      _id: { $ne: id },
      isDeleted: false,
      orderNo: orderNoNum
    }).lean();

    if (clash) {
      return res.status(409).json({
        status: false,
        message: `Order number ${orderNoNum} is already in use.`
      });
    }

    // If no change, return OK quickly
    if (doc.orderNo === orderNoNum) {
      return res.status(200).json({
        status: true,
        message: "No changes applied (orderNo is the same).",
        data: { id: doc._id, companyId: doc.companyId, orderNo: doc.orderNo }
      });
    }

    // Update and save
    doc.orderNo = orderNoNum;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Featured company updated successfully.",
      data: {
        id: doc._id,
        companyId: doc.companyId,
        orderNo: doc.orderNo,
        isDeleted: doc.isDeleted,
        updatedAt: doc.updatedAt
      }
    });
  } catch (err) {
    console.error("updateFeaturedCompanies error:", err);
    return res.status(500).json({ status: false, message: "Server error.", error: err.message });
  }
};

//featured companies list without token
exports.getFeaturedCompaniesPublic = async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip  = (page - 1) * limit;

    // 1) Find all companyIds that are currently featured (not soft-deleted)
    const featuredIds = await FeaturedCompany.find({ isDeleted: false }).distinct("companyId");
    if (featuredIds.length === 0) {
      return res.status(404).json({ status: false, message: "No featured companies found." });
    }

    // 2) Keep only companies that are NOT soft-deleted
    const activeCompanyIds = await CompanyProfile
      .find({ _id: { $in: featuredIds }, isDeleted: false })
      .distinct("_id");

    if (activeCompanyIds.length === 0) {
      return res.status(404).json({ status: false, message: "No featured companies found." });
    }

    // 3) Count & fetch paginated featured records filtered by active companies
    const [totalRecord, rows] = await Promise.all([
      FeaturedCompany.countDocuments({ isDeleted: false, companyId: { $in: activeCompanyIds } }),
      FeaturedCompany.find({ isDeleted: false, companyId: { $in: activeCompanyIds } })
        .sort({ orderNo: 1, createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: "companyId",
          select: "companyName aboutCompany companyAddress state city pincode image isDeleted",
          populate: { path: "state", select: "state" }
        })
        .lean()
    ]);

    // Filter out any rare race conditions where populated company is missing/soft-deleted
    const filtered = (rows || []).filter(r => r.companyId && r.companyId.isDeleted === false);

    if (filtered.length === 0) {
      return res.status(404).json({ status: false, message: "No featured companies found." });
    }

    const data = filtered.map(doc => ({
      id: doc._id,
      orderNo: doc.orderNo,

      companyId: doc.companyId?._id,
      companyName: doc.companyId?.companyName || null,
      aboutCompany: doc.companyId?.aboutCompany ?? null,
      companyAddress: doc.companyId?.companyAddress ?? null,
      state: doc.companyId?.state?.state ?? null,   // readable state name or null
      city: doc.companyId?.city ?? null,
      pincode: doc.companyId?.pincode ?? null,
      image: doc.companyId?.image ?? null,

      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));

    return res.status(200).json({
      status: true,
      message: "Featured companies fetched successfully.",
      totalRecord,
      currentPage: page,
      totalPages: Math.ceil(totalRecord / limit),
      data
    });
  } catch (err) {
    console.error("getPublicFeaturedCompanies error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};
