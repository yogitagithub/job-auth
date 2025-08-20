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

    // 2) Update name only if provided
    if (req.body && typeof req.body.name === "string" && req.body.name.trim()) {
      category.name = req.body.name.trim();
    }

    // 3) If a new image was uploaded, delete old file and set NEW URL
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

    // 4) Save
    await category.save();

    return res.json({
      status: true,
      message: "Updated successfully",
      data: {
        id: category._id,
        name: category.name,
        image: category.image || null
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

    // Instead of deleting the document, mark it as deleted
    const deleted = await Category.findByIdAndUpdate(
      id,
      { isDeleted: true },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({ status: false, message: "Category not found" });
    }

    return res.json({
      status: true,
      message: "Category soft deleted successfully",
    
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

//get categories of employer and job seeker
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

    // 3) Shape response
    const data = categories.map(c => ({
      id: c._id,
      name: c.name,
      image: c.image || null,
      isDeleted: !!c.isDeleted
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

  } catch (error) {
    console.error("Error fetching public categories:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch categories.",
      error: error.message
    });
  }
};

//Get job list based on category
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

    // Ensure category exists (optional but helpful)
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

    // Filter only by category
    const filter = { category: categoryId };

    // Count & fetch
    const totalRecord = await JobPost.countDocuments(filter);
    const totalPage   = Math.ceil(totalRecord / limit);

    const jobPosts = await JobPost.find(filter)
      .select("-createdAt -updatedAt -__v")
      .populate({ path: "companyId", select: "companyName image" })
      .populate("category", "name")
      .populate("industryType", "name")
      .populate("state", "state")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const data = jobPosts.map((j) => ({
      _id: j._id,
      company: j.companyId?.companyName ?? null,
      companyImage: j.companyId?.image ?? null,
      category: j.category?.name ?? null,
      industryType: j.industryType?.name ?? null,
      jobTitle: j.jobTitle,
      jobDescription: j.jobDescription,
      salaryType: j.salaryType,
      displayPhoneNumber: j.displayPhoneNumber,
      displayEmail: j.displayEmail,
      jobType: j.jobType,
      skills: j.skills,
      minSalary: j.minSalary,
      maxSalary: j.maxSalary,
      state: j.state?.state ?? null,
      experience: j.experience,
      otherField: j.otherField,
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

exports.getIndustry = async (req, res) => {
  try {
    const industries = await IndustryType.find().sort({ name: 1 }).lean(); 
    const formattedIndustries = industries.map(industry => ({
      id: industry._id,
      name: industry.name
    }));

    res.status(200).json({
      status: true,
      message: "Industry types fetched successfully.",
      data: formattedIndustries
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      message: "Error fetching industry types.",
      error: err.message
    });
  }
};

exports.getIndustryBasedOnRole = async (req, res) => {
  try {
    const { role } = req.user;

   
    if (!["employer", "job_seeker"].includes(role)) {
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


exports.getAllIndustriesPublic = async (req, res) => {
  try {
    const page  = parseInt(req.query.page, 10)  || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip  = (page - 1) * limit;

    // 1) Count for pagination
    const totalRecord = await IndustryType.countDocuments();
    const totalPage   = Math.ceil(totalRecord / limit);

    // 2) Fetch industries (sorted A→Z)
    const industries = await IndustryType.find()
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // 3) Shape response
    const data = industries.map(ind => ({
      id: ind._id,
      name: ind.name
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


exports.getJobProfileBasedOnRole = async (req, res) => {
  try {
    // verifyToken + verifyJobSeekerOnly already ran
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    const [totalRecord, rows] = await Promise.all([
      JobProfile.countDocuments({}),
      JobProfile.find({})
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    const data = rows.map(p => ({ id: p._id, name: p.name }));

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
    if (!doc || doc.isDeleted) {
      return res.status(404).json({ status: false, message: "Experience range not found" });
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
      return res.status(400).json({ status: false, message: "Valid id is required" });
    }

    const doc = await Experience.findById(id);
    if (!doc || doc.isDeleted) {
      return res.status(404).json({ status: false, message: "Experience range not found" });
    }

    doc.isDeleted = true;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Experience range deleted successfully."
    });
  } catch (err) {
    console.error("deleteExperience error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};


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
    if (!doc || doc.isDeleted) {
      return res.status(404).json({ status: false, message: "Job type not found" });
    }

    // duplicate guard among active docs
    const dupe = await JobType.findOne({
      _id: { $ne: id },
      isDeleted: false,
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" }
    });
    if (dupe) {
      return res.status(409).json({ status: false, message: "Another job type with this name already exists" });
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
    if (!doc || doc.isDeleted) {
      return res.status(404).json({ status: false, message: "Job type not found" });
    }

    doc.isDeleted = true;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Job type deleted successfully."
    });
  } catch (err) {
    console.error("deleteJobType error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};


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
    if (!doc || doc.isDeleted) {
      return res.status(404).json({ status: false, message: "Salary type not found" });
    }

    // duplicate guard among active docs (case-insensitive)
    const dupe = await SalaryType.findOne({
      _id: { $ne: id },
      isDeleted: false,
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" }
    });
    if (dupe) {
      return res.status(409).json({ status: false, message: "Another salary type with this name already exists" });
    }

    doc.name = name;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Salary type updated successfully.",
      data: doc
    });
  } catch (err) {
    console.error("updateSalaryType error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

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
      return res.status(400).json({ status: false, message: "Valid id is required" });
    }

    const doc = await SalaryType.findById(id);
    if (!doc || doc.isDeleted) {
      return res.status(404).json({ status: false, message: "Salary type not found" });
    }

    doc.isDeleted = true;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Salary type deleted successfully."
    });
  } catch (err) {
    console.error("deleteSalaryType error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};


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
      return res.status(400).json({ status: false, message: "name is required" });
    }

    const doc = await OtherField.findById(id);
    if (!doc || doc.isDeleted) {
      return res.status(404).json({ status: false, message: "Other field not found" });
    }

    // duplicate guard among active docs (case-insensitive)
    const dupe = await OtherField.findOne({
      _id: { $ne: id },
      isDeleted: false,
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" }
    });
    if (dupe) {
      return res.status(409).json({ status: false, message: "Another other field with this name already exists" });
    }

    doc.name = name;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Other field updated successfully.",
      data: doc
    });
  } catch (err) {
    console.error("updateOtherField error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

exports.deleteOtherField = async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid id is required" });
    }

    const doc = await OtherField.findById(id);
    if (!doc || doc.isDeleted) {
      return res.status(404).json({ status: false, message: "Other field not found" });
    }

    doc.isDeleted = true;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Other field deleted successfully."
    });
  } catch (err) {
    console.error("deleteOtherField error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

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




