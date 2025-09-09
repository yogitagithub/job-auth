const mongoose = require("mongoose");
const { Types } = mongoose;

const jwt = require("jsonwebtoken");
const Category = require("../models/AdminCategory");

const IndustryType = require("../models/AdminIndustry");
const Experience = require("../models/AdminExperienceRange");
const JobType = require("../models/AdminJobType");
const JobProfile = require("../models/AdminJobProfile");
const SalaryType = require("../models/AdminSalaryType");
const AccountType = require("../models/AdminAccountType");
const OtherField = require("../models/AdminOtherField");
const CurrentSalary = require("../models/AdminCurrentSalary");
const WorkingShift = require("../models/AdminWorkingShift");

const Skill = require("../models/Skills");


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

    

    // only non-deleted categories
    const filter = { isDeleted: false };

   
    // 2) Fetch page
    const categories = await Category.find(filter)
      .sort({ name: 1 })
      
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
      totalRecord: data.length,
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
//without job count
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


//with job count
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




// without token by category id
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
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip  = (page - 1) * limit;

      // NEW: exclude soft-deleted posts from public results
    const filter = { category: categoryId, isDeleted: false };

   

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
      .populate({ path: "otherField",   select: "name label title" }) 
      .populate({ path: "workingShift",   select: "name label title" })       // added
       .populate({ path: "jobProfile",   select: "name label title" })
      
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
        city: j.city,
      state: j.state?.state ?? null,
      experience: pickDisplay(j.experience), // now human-readable
      otherField: pickDisplay(j.otherField), // now human-readable
      workingShift: pickDisplay(j.workingShift),
       jobProfile: pickDisplay(j.jobProfile),
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





//without token by company id
exports.getJobPostsByCompanyPublic = async (req, res) => {
  try {
    const { companyId } = req.params;

    // Validate companyId
    if (!Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid companyId.",
      });
    }

    // Ensure company exists (adjust model if different)
    const companyExists = await CompanyProfile.exists({ _id: new Types.ObjectId(companyId) });
    if (!companyExists) {
      return res.status(404).json({
        status: false,
        message: "Company not found.",
      });
    }

    // Pagination
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip  = (page - 1) * limit;

    // FIX 1: use the correct field name from JobPost -> companyId
    // FIX 2: keep soft-delete exclusion here
    const filter = { 
      companyId: new Types.ObjectId(companyId),   // <-- was `company`; must be `companyId`
      isDeleted: false                            // <-- ensures soft-deleted posts are excluded
      // Optionally only show public/active:
      // , isAdminApproved: true
      // , isActive: true
    };

    // Count & fetch (use the SAME filter in both)
    const totalRecord = await JobPost.countDocuments(filter);
    const totalPage   = Math.ceil(totalRecord / limit) || 0;

    const jobPosts = await JobPost.find(filter)
      .select("-createdAt -updatedAt -__v")
      .populate({ path: "companyId",    select: "companyName image" })
      .populate({ path: "category",     select: "name" })
      .populate({ path: "industryType", select: "name" })
      .populate({ path: "state",        select: "state" })
      .populate({ path: "salaryType",   select: "name label title value" })
      .populate({ path: "jobType",      select: "name label title value" })
      .populate({ path: "experience",   select: "name range label" })
      .populate({ path: "otherField",   select: "name label title" }) 
      .populate({ path: "workingShift", select: "name label title" })  
      .populate({ path: "jobProfile",   select: "name label title" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Display-name helper
    const pickDisplay = (doc) => (doc ? (doc.name ?? doc.label ?? doc.title ?? doc.range ?? doc.value ?? null) : null);

    const data = jobPosts.map((j) => ({
      _id: j._id,
      company: j.companyId?.companyName ?? null,
      companyImage: j.companyId?.image ?? null,
      category: j.category?.name ?? null,
      industryType: j.industryType?.name ?? null,
      jobTitle: j.jobTitle,
      jobDescription: j.jobDescription,
      salaryType: pickDisplay(j.salaryType),
      displayPhoneNumber: j.displayPhoneNumber,
      displayEmail: j.displayEmail,
      jobType: pickDisplay(j.jobType),
      skills: j.skills,
      minSalary: j.minSalary,
      maxSalary: j.maxSalary,
      city: j.city,
      state: j.state?.state ?? null,
      experience: pickDisplay(j.experience),
      otherField: pickDisplay(j.otherField),
      workingShift: pickDisplay(j.workingShift),
      jobProfile: pickDisplay(j.jobProfile),
      status: j.status,
      expiredDate: j.expiredDate,
      isDeleted: j.isDeleted, // always false due to filter
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
    console.error("Error fetching jobs by company:", error);
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

    

    // only non-deleted industries
    const filter = { isDeleted: false };

    

    // fetch page
    const industries = await IndustryType.find(filter)
      .sort({ name: 1 })
     
      .lean();

    // shape response
    const data = industries.map(industry => ({
      id: industry._id,
      name: industry.name
    }));

    return res.status(200).json({
      status: true,
      message: `${role} industries fetched successfully.`,
    totalRecord: data.length,
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

//get job profile for job seeker and employer
exports.getJobProfileBasedOnRole = async (req, res) => {
  try {
    // ⛔ Block admins
    const role = req.user?.role;
    if (!role) {
      return res.status(401).json({ status: false, message: "Unauthorized." });
    }
    if (role === "admin") {
      return res.status(403).json({
        status: false,
        message: "Admins are not allowed to access this resource."
      });
    }

    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    const query = { isDeleted: false };

    const [totalRecord, rows] = await Promise.all([
      JobProfile.countDocuments(query),
      JobProfile.find(query).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean()
    ]);

    const data = rows.map(p => ({ id: p._id, name: p.name, isDeleted: p.isDeleted }));

    return res.status(200).json({
      status: true,
      message: data.length ? "Job profiles fetched successfully." : "No job profiles found.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit) || 0,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("getJobProfileBasedOnRole error:", err);
    return res.status(500).json({ status: false, message: "Server error.", error: err.message });
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



//get experience for employer and job seeker
exports.getExperienceRangeBasedOnRole = async (req, res) => {
  try {
    const role = req.user?.role;
    if (!role) {
      return res.status(401).json({ status: false, message: "Unauthorized." });
    }
    if (role === "admin") {
      return res.status(403).json({
        status: false,
        message: "Admins are not allowed to access this resource."
      });
    }

    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip  = (page - 1) * limit;

    const filter = { isDeleted: false };

    const [totalRecord, rows] = await Promise.all([
      Experience.countDocuments(filter),

      // 👇 Custom ordering: Fresher first, then by numeric min years ascending
      Experience.aggregate([
        { $match: filter },
        {
          $addFields: {
            _isFresher: {
              $cond: [
                { $regexMatch: { input: "$name", regex: /^fresher/i } },
                0,
                1
              ]
            },
            _minYears: {
              $let: {
                vars: { r: { $regexFind: { input: "$name", regex: /(\d+)/ } } },
                in: {
                  // if a number exists, use it; else push to end
                  $cond: [
                    { $ifNull: ["$$r.match", false] },
                    { $toInt: "$$r.match" },
                    9999
                  ]
                }
              }
            }
          }
        },
        { $sort: { _isFresher: 1, _minYears: 1, name: 1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: { _isFresher: 0, _minYears: 0 } }
      ])
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
    console.error("getExperienceRangeBasedOnRole error:", err);
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


     //blocks admin
      const role = req.user?.role;
    if (!role) {
      return res.status(401).json({ status: false, message: "Unauthorized." });
    }
    if (role === "admin") {
      return res.status(403).json({
        status: false,
        message: "Admins are not allowed to access this resource."
      });
    }



    // const role = req.user?.role;
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

     //blocks admin
     
    if (!role) {
      return res.status(401).json({ status: false, message: "Unauthorized." });
    }
    if (role === "admin") {
      return res.status(403).json({
        status: false,
        message: "Admins are not allowed to access this resource."
      });
    }




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



//get for employer, job seekeer
exports.getOtherFieldBasedOnRole = async (req, res) => {
  try {

     //blocks admin
      const role = req.user?.role;
    if (!role) {
      return res.status(401).json({ status: false, message: "Unauthorized." });
    }
    if (role === "admin") {
      return res.status(403).json({
        status: false,
        message: "Admins are not allowed to access this resource."
      });
    }
   
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
    // Pagination (safe bounds)
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip  = (page - 1) * limit;

    // NEW: read filter params
    const qPhone = (req.query.phoneNumber || "").trim();
    const qName  = (req.query.companyName || "").trim();

    // If you already have a global escapeRegex helper, remove this local one.
    const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Base filter (exclude soft-deleted)
    const filter = { isDeleted: false };

    // NEW: phone filter — exact for full numeric phones, else case-insensitive partial
    if (qPhone) {
      if (/^\d{8,15}$/.test(qPhone)) {
        filter.phoneNumber = qPhone;
      } else {
        filter.phoneNumber = { $regex: escapeRegex(qPhone), $options: "i" };
      }
    }

    // NEW: companyName filter — case-insensitive partial match
    if (qName) {
      filter.companyName = { $regex: escapeRegex(qName), $options: "i" };
      // If you want "starts with" instead of "contains", use:
      // filter.companyName = { $regex: `^${escapeRegex(qName)}`, $options: "i" };
    }

    // Count only non-deleted + applied filters
    const totalRecord = await CompanyProfile.countDocuments(filter);

    // Fetch only non-deleted + applied filters
    const companies = await CompanyProfile.find(filter)
      .populate("industryType", "name")
      .populate("state", "state")
      .sort({ createdAt: -1 }) // newest first
      .skip(skip)
      .limit(limit)
      .lean();

    if (!companies || companies.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No company profiles found."
      });
    }


    const data = companies.map((c) => {
      // Build gstCertificate like in getProfile
      const certUrl = c.gstCertificate?.fileUrl
        ? (c.gstCertificate.fileUrl.startsWith("http")
            ? c.gstCertificate.fileUrl
            : `${baseUrl}${c.gstCertificate.fileUrl}`)
        : null;

      // If your `image` can be a relative path, uncomment next two lines
      // const imageUrl = c.image
      //   ? (c.image.startsWith("http") ? c.image : `${baseUrl}${c.image}`)
      //   : null;

      return {
        id: c._id,
        userId: c.userId,
        phoneNumber: c.phoneNumber,
        companyName: c.companyName,
        industryType: c.industryType?.name || null,
        contactPersonName: c.contactPersonName,
        panCardNumber: c.panCardNumber,
        gstNumber: c.gstNumber,
        gstCertificate: certUrl,  // ✅ added

        alternatePhoneNumber: c.alternatePhoneNumber,
        email: c.email,
        companyAddress: c.companyAddress,
        state: c.state?.state || null,
        city: c.city,
        pincode: c.pincode,
        image: c.image || null // or use imageUrl if you want absolute
      };
    });

    
    





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



//Get Company Profile by ID
exports.getCompanyProfilesById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: false,
        message: "Invalid company ID format."
      });
    }

    // Fetch company profile
    const company = await CompanyProfile.findOne({ _id: id, isDeleted: false })
      .populate("industryType", "name")
      .populate("state", "state")
      .lean();

    if (!company) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found."
      });
    }

     // Build GST certificate URL like in getProfile
    const certUrl = company.gstCertificate?.fileUrl
      ? (company.gstCertificate.fileUrl.startsWith("http")
          ? company.gstCertificate.fileUrl
          : `${baseUrl}${company.gstCertificate.fileUrl}`)
      : null;



    // Shape response
    const data = {
      id: company._id,
      userId: company.userId,
      phoneNumber: company.phoneNumber,
      companyName: company.companyName,
      industryType: company.industryType?.name || null,
      contactPersonName: company.contactPersonName,
      panCardNumber: company.panCardNumber,
      gstNumber: company.gstNumber,


       gstCertificate: certUrl,

       
      alternatePhoneNumber: company.alternatePhoneNumber,
      email: company.email,
      companyAddress: company.companyAddress,
      state: company.state?.state || null,
      city: company.city,
      pincode: company.pincode,
      image: company.image
    };

    return res.status(200).json({
      status: true,
      message: "Company profile fetched successfully.",
      data
    });
  } catch (error) {
    console.error("getCompanyProfilesById error:", error);
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
    // Pagination
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip  = (page - 1) * limit;

    // NEW: read filter params
    const qPhone = (req.query.phoneNumber || "").trim();
    const qName  = (req.query.jobSeekerName || req.query.name || "").trim();

    // If you already have a global helper, remove this local one.
    const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Base filter (exclude soft-deleted)
    const filter = { isDeleted: false };

    // NEW: phone filter (exact if it looks like a full number; else partial match)
    if (qPhone) {
      if (/^\d{8,15}$/.test(qPhone)) {
        filter.phoneNumber = qPhone; // exact match for numeric phone-like strings
      } else {
        filter.phoneNumber = { $regex: escapeRegex(qPhone), $options: "i" }; // partial/case-insensitive
      }
    }

    // NEW: name filter (case-insensitive substring on `name` field)
    if (qName) {
      filter.name = { $regex: escapeRegex(qName), $options: "i" };
    }

    // Count only non-deleted + applied filters
    const totalRecord = await JobSeekerProfile.countDocuments(filter);

    // Fetch only non-deleted + applied filters
    const seeker = await JobSeekerProfile.find(filter)
      .populate("jobProfile", "name")
      .populate("industryType", "name")
      .populate("state", "state")
      .sort({ createdAt: -1 }) // newest first
      .skip(skip)
      .limit(limit)
      .lean();

    if (!seeker || seeker.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No job seeker profiles found."
      });
    }

    const data = seeker.map(s => ({
      id: s._id,
      userId: s.userId,
      phoneNumber: s.phoneNumber,
      jobSeekerName: s.name,
      industryType: s.industryType?.name || null,
      jobprofile: s.jobProfile?.name || null,
      dateOfBirth: s.dateOfBirth,
      panCardNumber: s.panCardNumber,
      gender: s.gender,
      alternatePhoneNumber: s.alternatePhoneNumber,
      email: s.email,
      jobSeekerAddress: s.address,
      state: s.state?.state || null,
      city: s.city,
      pincode: s.pincode,
      image: s.image,
      currentSalary: s.CurrentSalary,
         isExperienceAdded: s.isExperienceAdded,
          isSkillsAdded: s.isSkillsAdded,
           isEducationAdded: s.isEducationAdded, 
           isResumeAdded: s.isResumeAdded,
            isExperienced: s.isExperienced
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


//Get job seeker Profile by ID
exports.getJobSeekerProfilesbyId = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ status: false, message: "Invalid job seeker ID format." });
    }

    // Fetch (not deleted)
    const s = await JobSeekerProfile.findOne({ _id: id, isDeleted: false })
      .populate("jobProfile", "name")
      .populate("industryType", "name")
      .populate("state", "state")
      .lean();

    if (!s) {
      return res.status(404).json({ status: false, message: "Job seeker profile not found." });
    }

    // Shape response (match your list API keys)
    const data = {
      id: s._id,
      userId: s.userId,
      phoneNumber: s.phoneNumber,
      jobSeekerName: s.name,
      industryType: s.industryType?.name || null,
      jobprofile: s.jobProfile?.name || null, // keep same key as your list API
      dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth).toISOString().split("T")[0] : null,
      panCardNumber: s.panCardNumber,
      gender: s.gender,
      alternatePhoneNumber: s.alternatePhoneNumber,
      email: s.email,
      jobSeekerAddress: s.address,
      state: s.state?.state || null,
      city: s.city,
      pincode: s.pincode,

       currentSalary: s.CurrentSalary,
         isExperienceAdded: s.isExperienceAdded,
          isSkillsAdded: s.isSkillsAdded,
           isEducationAdded: s.isEducationAdded, 
           isResumeAdded: s.isResumeAdded,
            isExperienced: s.isExperienced,

      image: s.image
    };

    return res.status(200).json({
      status: true,
      message: "Job seeker profile fetched successfully.",
      data
    });
  } catch (error) {
    console.error("getJobSeekerProfilesbyId error:", error);
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
      return res.status(200).json({ status: true, message: "No featured companies found." });
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
      return res.status(200).json({ status: true, message: "No featured companies found." });
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


//current salary
exports.createCurrentSalary = async (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ status: false, message: "name is required" });

    // find by name (case-insensitive), even if soft-deleted
    const existing = await CurrentSalary.findOne({
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
          message: "Current salary restored successfully.",
          data: existing
        });
      }
      return res.status(409).json({ status: false, message: "Current salary already exists" });
    }

    const doc = await CurrentSalary.create({ name });
    return res.status(201).json({
      status: true,
      message: "Current salary created successfully.",
      data: doc
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ status: false, message: "Current salary already exists" });
    }
    console.error("createCurrentSalary error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

exports.updateCurrentSalary = async (req, res) => {
  try {
    const { id } = req.body || {};
    const name = (req.body?.name || "").trim();

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid id is required" });
    }
    if (!name) {
      return res.status(400).json({ status: false, message: "Name is required" });
    }

    const doc = await CurrentSalary.findById(id);

    if (!doc) {
      return res.status(404).json({ status: false, message: "Current salary not found" });
    }

    // 🚨 block updates on soft-deleted records
    if (doc.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This current salary is already soft deleted and cannot be updated."
      });
    }

    doc.name = name;

    try {
      await doc.save(); // may throw E11000 duplicate key error
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          status: false,
          message: "Another current salary with this name already exists"
        });
      }
      throw err;
    }

    return res.status(200).json({
      status: true,
      message: "Current salary updated successfully.",
      data: {
        id: doc._id,
        name: doc.name,
        isDeleted: doc.isDeleted
      }
    });
  } catch (err) {
    console.error("updateCurrentSalary error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};

exports.deleteCurrentSalary = async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid id is required" });
    }

    const doc = await CurrentSalary.findById(id);

    if (!doc) {
      return res.status(404).json({ status: false, message: "Current salary not found" });
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
      message: "Current salary soft deleted successfully."
    });
  } catch (err) {
    console.error("deleteCurrentSalary error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};

//get for admin
exports.getCurrentSalary = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const filter = { isDeleted: false };

    const [totalRecord, data] = await Promise.all([
      CurrentSalary.countDocuments(filter),
      CurrentSalary.find(filter)
        .sort({ createdAt: -1, _id: 1 }) // stable internal order
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    return res.status(200).json({
      status: true,
      message: "Current salaries fetched successfully.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit) || 0,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("getCurrentSalary error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};


//working shift
exports.createWorkingShift = async (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ 
      status: false, 
      message: "name is required" 
    });

    // find by name (case-insensitive), even if soft-deleted
    const existing = await WorkingShift.findOne({
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
          message: "Working shift restored successfully.",
          data: existing
        });
      }
      return res.status(409).json({ status: false, 
        message: "Working shift already exists" 
      });
    }

    const doc = await WorkingShift.create({ name });
    return res.status(201).json({
      status: true,
      message: "Working shift created successfully.",
      data: doc
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ status: false, 
        message: "Working shift already exists" 
      });
    }
    console.error("createWorkingShift error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};



exports.updateWorkingShift = async (req, res) => {
  try {
    const { id } = req.body || {};
    const name = (req.body?.name || "").trim();

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ 
        status: false, 
        message: "Valid id is required" 
      });
    }
    if (!name) {
      return res.status(400).json({ 
        status: false, 
        message: "Name is required" 
      });
    }

    const doc = await WorkingShift.findById(id);

    if (!doc) {
      return res.status(404).json({ 
        status: false, 
        message: "Working shift not found" 
      });
    }

   
    
    if (doc.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This working shift is already soft deleted and cannot be updated."
      });
    }

    doc.name = name;

    try {
      await doc.save(); // may throw E11000 duplicate key error
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          status: false,
          message: "Another working shift with this name already exists"
        });
      }
      throw err;
    }

    return res.status(200).json({
      status: true,
      message: "Working shift updated successfully.",
      data: {
        id: doc._id,
        name: doc.name,
        isDeleted: doc.isDeleted
      }
    });
  } catch (err) {
    console.error("updateWorkingShift error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};



exports.deleteWorkingShift = async (req, res) => {
  try {
    const { id } = req.body || {};

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ 
        status: false, 
        message: "Valid id is required" 
      });
    }

    const doc = await WorkingShift.findById(id);

    if (!doc) {
      return res.status(404).json({ 
        status: false, 
        message: "Working shift not found" 
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
      message: "Working shift soft deleted successfully."
    });
  } catch (err) {
    console.error("deleteWorkingShift error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};



//get for admin
exports.getWorkingShift = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const filter = { isDeleted: false };

    const [totalRecord, data] = await Promise.all([
      WorkingShift.countDocuments(filter),
      WorkingShift.find(filter)
        .sort({ createdAt: -1, _id: 1 }) // stable internal order
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    return res.status(200).json({
      status: true,
      message: "Working shift fetched successfully.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit) || 0,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("getWorkingShift error:", err);
    return res.status(500).json({ 
      status: false, 
      message: "Server error" 
    });
  }
};



//get working shift for job seeker and employer
exports.getWorkingShiftBasedOnRole = async (req, res) => {
  try {
    // ⛔ Block admins
    const role = req.user?.role;
    if (!role) {
      return res.status(401).json({ status: false, message: "Unauthorized." });
    }
    if (role === "admin") {
      return res.status(403).json({
        status: false,
        message: "Admins are not allowed to access this resource."
      });
    }

    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    const query = { isDeleted: false };

    const [totalRecord, rows] = await Promise.all([
      WorkingShift.countDocuments(query),
      WorkingShift.find(query).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean()
    ]);

    const data = rows.map(p => ({ id: p._id, name: p.name, isDeleted: p.isDeleted }));

    return res.status(200).json({
      status: true,
      message: data.length ? "Working shift fetched successfully." : "No working shift found.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit) || 0,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("getWorkingShiftBasedOnRole error:", err);
    return res.status(500).json({ status: false, message: "Server error.", error: err.message });
  }
};


//skill set

const tidy = s => String(s || "").trim().replace(/\s+/g, " ");

exports.createSkill = async (req, res) => {
  const { skill } = req.body || {};
  if (!skill || !skill.trim()) {
    return res.status(400).json({ status: false, message: "Skill required" });
  }

  const pretty = tidy(skill);

  try {
    const doc = await Skill.create({ skill: pretty, count: 0, isDeleted: false });
    return res.status(201).json({
      status: true,
      message: "Skill created successfully",
      data: { id: doc._id, skill: doc.skill, count: doc.count }
    });

  } catch (err) {
    // Duplicate => either active (conflict) or soft-deleted (restore)
    if (err?.code === 11000) {
      const existing = await Skill.findOne({ skill: pretty })
        .collation({ locale: "en", strength: 2 });

      if (!existing) {
        // Very rare race; safe fallback
        return res.status(400).json({ status: false, message: "Skill already exists." });
      }

      if (existing.isDeleted) {
        existing.skill = pretty;   // keep tidy spacing/case
        existing.isDeleted = false;
        await existing.save();
        return res.status(201).json({
          status: true,
          message: "Skill restored successfully",
          data: { id: existing._id, skill: existing.skill, count: existing.count }
        });
      }

      return res.status(400).json({
        status: false,
        message: "Skill already exists.",
       
      });
    }

    return res.status(500).json({ status: false, message: "Error creating skill", error: err.message });
  }
};


//for admin only
exports.getSkill = async (req, res) => {
  try {
    // Admin only
    const role = req.user?.role;
    if (role !== "admin") {
      return res.status(403).json({ status: false, message: "Admin token required." });
    }

    const search = norm(req.query.search || "");
    const type   = String(req.query.type || "active").toLowerCase();
    const page   = Math.max(parseInt(req.query.page, 10) || 1, 1);

    // base limit (used for active/search)
    let limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    // popular: "count" controls page size (default 5 if neither count nor limit given)
    if (type === "popular") {
      const c = parseInt(req.query.count, 10);
      if (Number.isFinite(c) && c > 0) {
        limit = Math.min(c, 100);
      } else if (!req.query.limit) {
        limit = 5;
      }
    }

    const base = { isDeleted: false };

    // ---------- SEARCH (prefix-first, no aggregation) ----------
    if (search) {
      const q = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape regex
      const prefix   = new RegExp("^" + q, "i"); // starts-with
      const anywhere = new RegExp(q, "i");       // substring

      const prefixFilter = { ...base, skill: prefix };
      const restFilter   = { $and: [{ ...base }, { skill: anywhere }, { skill: { $not: prefix } }] };

      const [prefixCount, restCount] = await Promise.all([
        Skill.countDocuments(prefixFilter),
        Skill.countDocuments(restFilter),
      ]);

      const totalRecord = prefixCount + restCount;
      const skip = (page - 1) * limit;

      // how many to skip/take from prefix vs rest pages
      const prefixSkip = Math.min(skip, prefixCount);
      const prefixTake = Math.max(0, Math.min(limit, prefixCount - prefixSkip));

      const [prefixRows, restRows] = await Promise.all([
        prefixTake > 0
          ? Skill.find(prefixFilter)
              .select("skill count")
              .collation({ locale: "en", strength: 2 })
              .sort({ count: -1, skill: 1 }) // more popular first inside prefix group
              .skip(prefixSkip)
              .limit(prefixTake)
              .lean()
          : Promise.resolve([]),

        (limit - prefixTake) > 0
          ? Skill.find(restFilter)
              .select("skill count")
              .collation({ locale: "en", strength: 2 })
              .sort({ count: -1, skill: 1 }) // then other matches by popularity
              .skip(Math.max(0, skip - prefixCount))
              .limit(limit - prefixTake)
              .lean()
          : Promise.resolve([]),
      ]);

      const rows = prefixRows.concat(restRows);
      const data = rows.map(s => ({ id: s._id, skill: s.skill, count: s.count }));

      return res.status(200).json({
        status: true,
        message: data.length ? "Skills fetched successfully." : "No matching skills found.",
        totalRecord,
        totalPage: Math.ceil(totalRecord / limit || 1),
        currentPage: page,
        data,
      });
    }

    // ---------- POPULAR / ACTIVE ----------
    const filter = { ...base };
    const sort   = type === "popular" ? { count: -1, skill: 1 } : { skill: 1 };
    const messageIfEmpty = type === "popular" ? "No popular skills found." : "No active skills found.";

    const [totalRecord, rows] = await Promise.all([
      Skill.countDocuments(filter),
      Skill.find(filter)
        .select("skill count")
        .collation({ locale: "en", strength: 2 })
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const data = rows.map(s => ({ id: s._id, skill: s.skill, count: s.count }));

    return res.status(200).json({
      status: true,
      message: data.length ? "Skills fetched successfully." : messageIfEmpty,
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit || 1),
      currentPage: page,
      data,
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Error fetching admin skills",
      error: err.message,
    });
  }
};



exports.updateSkill = async (req, res) => {
  try {
    const { id } = req.params;
    const { skill } = req.body || {};

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Invalid skill id." });
    }
    if (!skill || !skill.trim()) {
      return res.status(400).json({ status: false, message: "Skill required" });
    }

    const pretty = tidy(skill);

    // 1) Fetch the target
    const target = await Skill.findById(id).lean();
    if (!target) {
      return res.status(404).json({ status: false, message: "Skill not found." });
    }
    if (target.isDeleted) {
      return res.status(409).json({
        status: false,
        message: "Cannot update a soft-deleted skill."
      });
    }

    // 2) If no effective change (case-insensitive & space-normalized), short-circuit
    const oldNorm = tidy(target.skill).toLowerCase();
    const newNorm = pretty.toLowerCase();
    if (oldNorm === newNorm) {
      return res.status(200).json({
        status: true,
        message: "No changes detected.",
        data: { id: target._id, skill: target.skill, count: target.count }
      });
    }

    // 3) Prevent collision with another ACTIVE skill (case-insensitive)
    const conflict = await Skill.findOne({
      _id: { $ne: id },
      isDeleted: false,
      skill: pretty
    }).collation({ locale: "en", strength: 2 }); // case-insensitive

    if (conflict) {
      return res.status(409).json({
        status: false,
        message: "Another active skill with the same name already exists."
      });
    }

    // 4) Update
    const updated = await Skill.findByIdAndUpdate(
      id,
      { $set: { skill: pretty } },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      status: true,
      message: "Skill updated successfully.",
      data: { id: updated._id, skill: updated.skill, count: updated.count }
    });

  } catch (err) {
    if (err?.code === 11000) {
      // Unique index collision fallback
      return res.status(409).json({
        status: false,
        message: "Another active skill with the same name already exists."
      });
    }
    return res.status(500).json({ status: false, message: "Error updating skill", error: err.message });
  }
};



exports.deleteSkill = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Invalid skill id." });
    }

    // 1) Check existence first (as requested)
    const existing = await Skill.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ status: false, message: "Skill not found." });
    }

    // 2) Already soft-deleted?
    if (existing.isDeleted) {
      return res.status(409).json({
        status: false,
        message: "Skill is already soft-deleted."
      });
    }

    // 3) Soft delete
    const updated = await Skill.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true } },
      { new: true }
    ).select("skill count isDeleted");

    return res.status(200).json({
      status: true,
      message: "Skill soft-deleted successfully.",
      data: { id: updated._id, skill: updated.skill, count: updated.count, isDeleted: updated.isDeleted }
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: "Error deleting skill", error: err.message });
  }
};



//get list of admin skill list on the basis of search, populara and active for employer and job seeker
const norm = (s = "") => String(s).trim().replace(/\s+/g, " ");


exports.listAdminSkills = async (req, res) => {
  try {
    const role = req.user?.role;
    if (!["job_seeker", "employer"].includes(role)) {
      return res.status(403).json({ status: false, message: "Unauthorized role." });
    }

    const search = norm(req.query.search || "");
    const type   = String(req.query.type || "active").toLowerCase();

    const page   = Math.max(parseInt(req.query.page, 10) || 1, 1);

    // base limit (used for active/search)
    let limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    // ----- popular: count controls page size (default 5) -----
    if (type === "popular") {
      const c = parseInt(req.query.count, 10);
      if (Number.isFinite(c) && c > 0) {
        limit = Math.min(c, 100);   // count wins if valid
      } else if (!req.query.limit) {
        limit = 5;                  // no count/limit => default 5
      }
    }

    const base = { isDeleted: false };

    // ---------- SEARCH (prefix-first, no aggregation) ----------
    if (search) {
      const q = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const prefix   = new RegExp("^" + q, "i");
      const anywhere = new RegExp(q, "i");

      const prefixFilter = { ...base, skill: prefix };
      const restFilter   = { $and: [{ ...base }, { skill: anywhere }, { skill: { $not: prefix } }] };

      const [prefixCount, restCount] = await Promise.all([
        Skill.countDocuments(prefixFilter),
        Skill.countDocuments(restFilter),
      ]);
      const totalRecord = prefixCount + restCount;
      const skip = (page - 1) * limit;

      const prefixSkip = Math.min(skip, prefixCount);
      const prefixTake = Math.max(0, Math.min(limit, prefixCount - prefixSkip));

      const [prefixRows, restRows] = await Promise.all([
        prefixTake > 0
          ? Skill.find(prefixFilter)
              .select("skill count")
              .collation({ locale: "en", strength: 2 })
              .sort({ count: -1, skill: 1 })
              .skip(prefixSkip)
              .limit(prefixTake)
              .lean()
          : Promise.resolve([]),
        (limit - prefixTake) > 0
          ? Skill.find(restFilter)
              .select("skill count")
              .collation({ locale: "en", strength: 2 })
              .sort({ count: -1, skill: 1 })
              .skip(Math.max(0, skip - prefixCount))
              .limit(limit - prefixTake)
              .lean()
          : Promise.resolve([]),
      ]);

      const rows = prefixRows.concat(restRows);
      const data = rows.map(s => ({ id: s._id, skill: s.skill, count: s.count }));

      return res.status(200).json({
        status: true,
        message: data.length ? "Skills fetched successfully." : "No matching skills found.",
        totalRecord,
        totalPage: Math.ceil(totalRecord / limit || 1),
        currentPage: page,
        data,
      });
    }

    // ---------- POPULAR / ACTIVE ----------
    const filter = { ...base };
    const sort   = type === "popular" ? { count: -1, skill: 1 } : { skill: 1 };
    const messageIfEmpty = type === "popular" ? "No popular skills found." : "No active skills found.";

    const [totalRecord, rows] = await Promise.all([
      Skill.countDocuments(filter),
      Skill.find(filter)
        .select("skill count")
        .collation({ locale: "en", strength: 2 })
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const data = rows.map(s => ({ id: s._id, skill: s.skill, count: s.count }));

    return res.status(200).json({
      status: true,
      message: data.length ? "Skills fetched successfully." : messageIfEmpty,
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit || 1),
      currentPage: page,
      data,
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: "Error fetching admin skills", error: err.message });
  }
};



//account type
exports.createAccountType = async (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ status: false, message: "name is required" });

    // case-insensitive find (even if soft-deleted)
    const existing = await AccountType.findOne({
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
          message: "Account type restored successfully.",
          data: existing
        });
      }
      return res.status(409).json({ status: false, message: "Account type already exists" });
    }

    const doc = await AccountType.create({ name });
    return res.status(201).json({
      status: true,
      message: "Account type created successfully.",
      data: doc
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ status: false, message: "Account type already exists" });
    }
    console.error("createAccountType error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};




exports.updateAccountType = async (req, res) => {
  try {
    const { id } = req.body || {};
    const name = (req.body?.name || "").trim();

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid id is required" });
    }
    if (!name) {
      return res.status(400).json({ status: false, message: "name is required" });
    }

    const doc = await AccountType.findById(id);
    if (!doc) {
      return res.status(404).json({ status: false, message: "Account type not found" });
    }

    // ❌ Block updates on soft-deleted docs
    if (doc.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This account type is already soft deleted and cannot be updated."
      });
    }

    // Duplicate guard among active docs (case-insensitive exact match)
    const dupe = await AccountType.findOne({
      _id: { $ne: id },
      isDeleted: false,
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" }
    });
    if (dupe) {
      return res.status(409).json({
        status: false,
        message: "Another account type with this name already exists"
      });
    }

    doc.name = name;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Account type updated successfully.",
      data: {
        id: doc._id,
        name: doc.name,
        isDeleted: doc.isDeleted
      }
    });
  } catch (err) {
    console.error("updateAccountType error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};



//get account type for admin
exports.getAccountTypes = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const filter = { isDeleted: false };

    const [totalRecord, data] = await Promise.all([
      AccountType.countDocuments(filter),
      AccountType.find(filter)
        .sort({ createdAt: -1, _id: 1 }) // stable internal order
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    return res.status(200).json({
      status: true,
      message: "Account types fetched successfully.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit) || 0,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("getAccountTypes error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};




exports.deleteAccountType = async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        status: false,
        message: "Valid id is required"
      });
    }

    const doc = await AccountType.findById(id);

    if (!doc) {
      return res.status(404).json({
        status: false,
        message: "Account type not found"
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
      message: "Account type deleted successfully."
    });

  } catch (err) {
    console.error("deleteAccountType error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};




//get account types for employer and job seeker
exports.getAccountTypeBasedOnRole = async (req, res) => {
  try {
    const role = req.user?.role;

     //blocks admin
     
    if (!role) {
      return res.status(401).json({ status: false, message: "Unauthorized." });
    }
    if (role === "admin") {
      return res.status(403).json({
        status: false,
        message: "Admins are not allowed to access this resource."
      });
    }




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
      AccountType.countDocuments(filter),
      AccountType.find(filter)
        .sort({ createdAt: -1, _id: 1 }) // stable order
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    const data = rows.map(s => ({ id: s._id, name: s.name }));

    return res.status(200).json({
      status: true,
      message: data.length ? "Account types fetched successfully." : "No account types found.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit) || 0,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("getAccountTypeBasedOnRole error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};












