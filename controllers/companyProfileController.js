const CompanyProfile = require("../models/CompanyProfile");
const IndustryType = require("../models/AdminIndustry");
const JobSeekerProfile  = require("../models/JobSeekerProfile");
const StateCity = require("../models/StateCity");
const Notification = require("../models/Notification");

const createNotification = require("../config/createNotification");


const JobPost = require("../models/JobPost");
const JobApplication = require("../models/JobApplication");
const Subscription = require("../models/Subscription");

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const mongoose = require("mongoose");



exports.saveProfile = async (req, res) => {
  try {
    const { userId, role, phoneNumber } = req.user;

    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can create or update company profiles."
      });
    }

    // ---------- BASE URL ----------
    const baseUrl =
      (process.env.BASE_URL && process.env.BASE_URL.replace(/\/$/, "")) ||
      `${req.protocol}://${req.get("host")}`;

    const hasAnyBody = req.body && Object.keys(req.body).length > 0;
    const hasFile = !!req.file;

    // ---------- Load profile ----------
    let profile = await CompanyProfile.findOne({ userId });

    if (profile && profile.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This company profile is already deleted and cannot be updated."
      });
    }

    // ---------- Normalize aboutCompany ----------
    if ("aboutCompany" in req.body) {
      const v = req.body.aboutCompany;
      req.body.aboutCompany = v && String(v).trim() ? String(v).trim() : null;
    }

    // ---------- Normalize GST ----------
    const gstProvidedThisRequest = "gstNumber" in req.body;
    if (gstProvidedThisRequest) {
      const v = req.body.gstNumber;
      req.body.gstNumber = v && String(v).trim() ? String(v).trim() : null;
    }

    // ---------- Resolve industryType ----------
    if ("industryType" in req.body) {
      const val = req.body.industryType;
      let industryDoc = null;

      if (mongoose.Types.ObjectId.isValid(val)) {
        industryDoc = await IndustryType.findById(val);
      }

      if (!industryDoc && typeof val === "string") {
        industryDoc = await IndustryType.findOne({
          name: val.trim()
        });
      }

      if (!industryDoc) {
        return res.status(400).json({
          status: false,
          message: "Invalid industry type."
        });
      }

      req.body.industryType = industryDoc._id;
    }

    // ================== OTHER INDUSTRY LOGIC (FIXED) ==================

    const effectiveIndustryId =
      req.body.industryType || profile?.industryType || null;

    let isOtherIndustry = false;

    if (effectiveIndustryId) {
      const industryDoc = await IndustryType.findById(effectiveIndustryId);
      if (industryDoc && industryDoc.name.toLowerCase() === "other") {
        isOtherIndustry = true;
      }
    }

    if (isOtherIndustry) {
      const otherName = req.body.otherIndustryName?.trim();

      if (!otherName) {
        return res.status(400).json({
          status: false,
          message: "Please specify other industry name."
        });
      }

      req.body.otherIndustryName = otherName;
    } else {
      req.body.otherIndustryName = null;
    }

    // ================== STATE & CITY ==================

    const hasStateKey = "state" in req.body;
    const hasCityKey = "city" in req.body;

    const stateInput = hasStateKey ? String(req.body.state || "").trim() : "";
    const cityInput = hasCityKey ? String(req.body.city || "").trim() : "";

    const resolveState = async (input) => {
      if (mongoose.Types.ObjectId.isValid(input)) {
        return StateCity.findById(input);
      }
      if (!input) return null;

      return StateCity.findOne({
        state: { $regex: `^${input}$`, $options: "i" }
      });
    };

    let stateDoc = null;

    if (stateInput) {
      stateDoc = await resolveState(stateInput);
      if (!stateDoc) {
        return res.status(400).json({ status: false, message: "Invalid state." });
      }

      if (cityInput) {
        const ok = (stateDoc.cities || []).some(
          c => c.toLowerCase() === cityInput.toLowerCase()
        );
        if (!ok) {
          return res.status(400).json({
            status: false,
            message: "Invalid city for the selected state."
          });
        }
      }

      req.body.state = stateDoc._id;
    } else if (!stateInput && cityInput) {
      stateDoc = await StateCity.findOne({
        cities: { $elemMatch: { $regex: `^${cityInput}$`, $options: "i" } }
      });

      if (!stateDoc) {
        return res.status(400).json({
          status: false,
          message: "Invalid city, no matching state found."
        });
      }

      req.body.state = stateDoc._id;
    }

    // ================== EMPLOYER TYPE RULES ==================

    const employerType = req.body.employerType || profile?.employerType;

    if (!employerType) {
      return res.status(400).json({
        status: false,
        message: "employerType is required."
      });
    }

    if (employerType === "individual") {
      if (req.body.gstNumber || req.file) {
        return res.status(400).json({
          status: false,
          message: "GST details are not allowed for individual employers."
        });
      }

      req.body.gstNumber = null;
      req.body.gstCertificate = null;
    }

    if (employerType === "company") {
      if (!profile && !gstProvidedThisRequest) {
        return res.status(400).json({
          status: false,
          message: "GST number is required for company employer type."
        });
      }

      if (!profile && !req.file) {
        return res.status(400).json({
          status: false,
          message: "GST certificate is required for company employer type."
        });
      }
    }

    // ================== GST RULES ==================

    const oldGst = profile?.gstNumber || null;
    const newGst = gstProvidedThisRequest ? req.body.gstNumber : oldGst;
    const clearingGst = gstProvidedThisRequest && !req.body.gstNumber;
    const gstChanged = gstProvidedThisRequest && newGst !== oldGst;

    if (hasFile && !gstProvidedThisRequest) {
      return res.status(400).json({
        status: false,
        message: "Please provide GST number with certificate upload."
      });
    }

    if ((newGst || oldGst) && !clearingGst) {
      const hasExistingCert = !!profile?.gstCertificate?.fileUrl;
      if (!hasFile && !hasExistingCert) {
        return res.status(400).json({
          status: false,
          message: "GST certificate is required when GST number is set."
        });
      }
    }

    if (gstChanged && !hasFile) {
      return res.status(400).json({
        status: false,
        message: "New GST certificate required when updating GST number."
      });
    }

    // ================== BUILD UPDATE ==================

    const restricted = ["_id", "userId", "phoneNumber", "__v", "image", "isDeleted"];
    const bodyUpdates = Object.keys(req.body).reduce((acc, k) => {
      if (!restricted.includes(k)) acc[k] = req.body[k];
      return acc;
    }, {});

    let newCertificate = null;
    if (hasFile) {
      newCertificate = {
        fileUrl: `${baseUrl}/api/uploads/certificates/${req.file.filename}`,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size
      };
    }

    const isCreate = !profile;

    if (isCreate) {
      profile = new CompanyProfile({
        userId,
        phoneNumber,
        ...bodyUpdates,
        ...(newCertificate && { gstCertificate: newCertificate })
      });
      await profile.save();
    } else {
      if (newCertificate && profile.gstCertificate?.fileUrl) {
        try {
          const pathname = new URL(profile.gstCertificate.fileUrl).pathname;
          const absolute = path.join(process.cwd(), pathname.slice(1));
          await fsp.unlink(absolute).catch(() => {});
        } catch {}
      }

      Object.assign(profile, bodyUpdates);
      if (newCertificate) profile.gstCertificate = newCertificate;
      await profile.save();
    }

    const populated = await CompanyProfile.findById(profile._id)
      .populate("industryType", "name")
      .populate("state", "state")
      .lean();

    return res.status(200).json({
      status: true,
      message: `Company profile ${isCreate ? "created" : "updated"} successfully.`,
      data: {
        ...populated,
        industryType: populated.industryType?.name || null,
        state: populated.state?.state || null
      }
    });

  } catch (error) {
    console.error("saveProfile error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};




exports.getProfile = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can view company profiles."
      });
    }

    // ---------- BASE URL ----------
    const baseUrl =
      (process.env.BASE_URL && process.env.BASE_URL.replace(/\/$/, "")) ||
      `${req.protocol}://${req.get("host")}`;

    // ---------- Fetch profile ----------
    const profile = await CompanyProfile.findOne({ userId })
      .populate("industryType", "name")
      .populate("state", "state");

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found."
      });
    }

    if (profile.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This company profile has been already deleted."
      });
    }

    const p = profile.toObject();

    // ---------- Flatten GST certificate ----------
    const certUrl = p.gstCertificate?.fileUrl
      ? (p.gstCertificate.fileUrl.startsWith("http")
          ? p.gstCertificate.fileUrl
          : `${baseUrl}${p.gstCertificate.fileUrl}`)
      : null;


      // ---------- APPROVED APPLICANTS COUNT ----------
const employerJobPosts = await JobPost.find({
  userId,
  isDeleted: false
}).select("_id");

const postIds = employerJobPosts.map(p => p._id);

let approvedApplicantsCount = 0;

if (postIds.length > 0) {
  approvedApplicantsCount = await JobApplication.countDocuments({
    jobPostId: { $in: postIds },
    employerApprovalStatus: "Approved",
    status: "Applied"
  });
}


    // ---------- RESPONSE (ALL SAVED FIELDS) ----------
    const responseData = {
      id: p._id,
      userId: p.userId,
      phoneNumber: p.phoneNumber,
      alternatePhoneNumber: p.alternatePhoneNumber ?? null,

      companyName: p.companyName ?? null,
      contactPersonName: p.contactPersonName ?? null,
      employerType: p.employerType ?? null,

      industryType: p.industryType?.name || null,
      otherIndustryName:
        p.industryType?.name === "Other"
          ? p.otherIndustryName
          : null,

      gstNumber: p.gstNumber ?? null,
      gstCertificate: certUrl,

      email: p.email ?? null,
      companyAddress: p.companyAddress ?? null,

      state: p.state?.state || null,
      city: p.city ?? null,
      pincode: p.pincode ?? null,

      image: p.image ?? null,
      aboutCompany: p.aboutCompany ?? null,

      connectedCandidates: approvedApplicantsCount,

      totalViews: p.totalViews ?? 0,
      profileViews: p.profileViews ?? [],

      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    };

    return res.status(200).json({
      status: true,
      message: "Company profile fetched successfully.",
      data: responseData
    });

  } catch (error) {
    console.error("getProfile error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};



exports.deleteCompanyProfile = async (req, res) => {
  try {
    const { role, userId } = req.user;
    const { id } = req.body;

    // AuthZ: only employers
    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can delete company profiles."
      });
    }

    // Validate ID
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: false,
        message: "Valid company profile ID is required."
      });
    }

    // Load the profile
    const profile = await CompanyProfile.findById(id);
    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found."
      });
    }

    // Ownership check
    if (profile.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to delete this profile."
      });
    }

    // Already soft-deleted?
    if (profile.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This company profile is already deleted."
      });
    }

    // Soft delete
    profile.isDeleted = true;
    profile.deletedAt = new Date(); // will be saved only if 'deletedAt' exists in schema
    await profile.save();

    return res.status(200).json({
      status: true,
      message: "Company profile deleted successfully."
    });
  } catch (error) {
    console.error("Error deleting company profile:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};

exports.updateProfileImage = async (req, res) => {
  try {
    const { userId, role } = req.user;

    console.log("Incoming Request User:", req.user);
    console.log("Uploaded File Details:", req.file);

    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can update the company image."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: false,
        message: "Image file is required."
      });
    }

    const profile = await CompanyProfile.findOne({ userId });
    console.log("Fetched Profile from DB:", profile);

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found."
      });
    }

  
if (profile.image) {
  console.log("Existing image URL in DB:", profile.image);

  const oldImageFile = path.basename(profile.image);
  console.log("Extracted old image filename:", oldImageFile);

  if (oldImageFile && oldImageFile !== req.file.filename) {
    const oldImagePath = path.join(__dirname, "..", "uploads", "images", oldImageFile);
    console.log("Full old image path to delete:", oldImagePath);

    try {
      await fsp.unlink(oldImagePath); 
      console.log("Old image deleted successfully:", oldImageFile);
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error("⚠ Error deleting old image:", err);
      }
    }
  } else {
    console.log("No old image to delete or same filename uploaded");
  }
}

   
   
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const newImagePath = `${baseUrl}/api/uploads/images/${req.file.filename}`;
    console.log("New image URL to save in DB:", newImagePath);

    profile.image = newImagePath;
    await profile.save();

    console.log("Profile updated successfully with new image");

    return res.status(200).json({
      status: true,
      message: "Company profile image updated successfully. Old image deleted if it existed.",
      data: {
        image: newImagePath,
      },
    });

  } catch (error) {
    console.error("Error updating company profile image:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};


//upload cover picture
exports.updateCoverPic = async (req, res) => {
  try {
    const { userId, role } = req.user;

    console.log("Incoming Request User:", req.user);
    console.log("Uploaded File Details:", req.file);

    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can update the company image."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: false,
        message: "Image file is required."
      });
    }

    const profile = await CompanyProfile.findOne({ userId });
    console.log("Fetched Profile from DB:", profile);

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found."
      });
    }

  
if (profile.coverImage) {
  console.log("Existing image URL in DB:", profile.coverImage);

  const oldImageFile = path.basename(profile.coverImage);
  console.log("Extracted old image filename:", oldImageFile);

  if (oldImageFile && oldImageFile !== req.file.filename) {
    const oldImagePath = path.join(__dirname, "..", "uploads", "images", oldImageFile);
    console.log("Full old image path to delete:", oldImagePath);

    try {
      await fsp.unlink(oldImagePath); 
      console.log("Old image deleted successfully:", oldImageFile);
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error("Error deleting old image:", err);
      }
    }
  } else {
    console.log("No old image to delete or same filename uploaded");
  }
}

   
   
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const newImagePath = `${baseUrl}/api/uploads/images/${req.file.filename}`;
    console.log("New image URL to save in DB:", newImagePath);

    profile.coverImage = newImagePath;
    await profile.save();

    console.log("Profile updated successfully with new image");

    return res.status(200).json({
      status: true,
      message: "Company profile image updated successfully. Old image deleted if it existed.",
      data: {
        image: newImagePath,
      },
    });

  } catch (error) {
    console.error("Error updating company profile image:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};








exports.getProfileImage = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can fetch the profile image."
      });
    }

    const profile = await CompanyProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found."
      });
    }

    return res.status(200).json({
      status: true,
      message: "Company profile image fetched successfully.",
      data: {
        image: profile.image || null
      }
    });
  } catch (error) {
    console.error("Error fetching company profile image:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};


//get cover picture
exports.getCoverImage = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can fetch the cover picture."
      });
    }

    const profile = await CompanyProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found."
      });
    }

    return res.status(200).json({
      status: true,
      message: "Company cover picture fetched successfully.",
      data: {
        image: profile.coverImage || null
      }
    });
  } catch (error) {
    console.error("Error fetching company cover picture:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};



//without token
exports.getAllCompanies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Count only non-deleted companies
    const totalCompanies = await CompanyProfile.countDocuments({ isDeleted: false });

    const companies = await CompanyProfile.find({ isDeleted: false }) // ✅ filter here
      .populate("industryType", "name")
      .populate("state", "state")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    if (!companies || companies.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No company profiles found."
      });
    }

    const responseData = companies.map(company => ({
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

    return res.json({
      status: true,
      message: "Company profiles fetched successfully.",
      totalCompanies,
      currentPage: page,
      totalPages: Math.ceil(totalCompanies / limit),
      data: responseData
    });
  } catch (error) {
    console.error("Error fetching companies:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};



//get progress bar for employer profile completion
exports.getEmployerProfileProgress = async (req, res) => {
  try {
    const { userId, role } = req.user;

    // 1) Only Employers allowed
    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Only employers can view company profile progress.",
      });
    }

    // 2) Fetch employer profile (do NOT filter by isDeleted so we can message properly)
    const profile = await CompanyProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found.",
      });
    }

    // 3) Soft-deleted?
    if (profile.isDeleted) {
      return res.status(423).json({
        status: false,
        message: "Your company profile is disabled.",
      });
    }

    // 4) Fields to count toward progress (adjust as you like)
    let FIELDS = [
  "phoneNumber",
  "companyName",
  "industryType",
  "contactPersonName",
  "email",
  "companyAddress",
  "state",
  "city",
  "pincode",
  "image",
  "aboutCompany"
];

// GST required only for company
if (profile.employerType === "company") {
  FIELDS.push("gstNumber");
  FIELDS.push("gstCertificate.fileUrl");
}


    // Helper: get nested value by path
    const getVal = (obj, path) =>
      path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);

    // Helper: consider a field "filled" if truthy & not empty string after trim
    const isFilled = (val) => {
      if (val === null || val === undefined) return false;
      if (typeof val === "string") return val.trim().length > 0;
      if (Array.isArray(val)) return val.length > 0;
      // for ObjectId / numbers / objects: truthy is fine
      return Boolean(val);
    };

    const filled = FIELDS.reduce((acc, key) => acc + (isFilled(getVal(profile, key)) ? 1 : 0), 0);
    const total  = FIELDS.length;

   const progress = total
      ? Math.min(100, Math.max(0, Math.round((filled / total) * 100)))
      : 0;


    return res.status(200).json({
      status: true,
      message: "Company profile progress fetched successfully.",
      progress, // e.g., 60
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: false,
      message: "Server error.",
    });
  }
};


//get profile views of a company profile by job seeker
exports.recordCompanyProfileView = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { userId, role } = req.user; // from verifyToken

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can record company profile views.",
      });
    }

    if (!mongoose.isValidObjectId(companyId)) {
      return res.status(400).json({ status: false, message: "Invalid companyId." });
    }

    // Fetch job seeker profile
    const seeker = await JobSeekerProfile.findOne({ userId })
      .select("_id name")
      .lean();

    if (!seeker) {
      return res.status(404).json({
        status: false,
        message: "Job seeker profile not found for this user.",
      });
    }

    // Fetch company with its owner userId
    const company = await CompanyProfile.findById(companyId)
      .select("_id companyName isDeleted userId")
      .lean();

    if (!company) {
      return res.status(404).json({ status: false, message: "Company profile not found." });
    }

    if (company.isDeleted) {
      return res.status(410).json({ status: false, message: "This company profile has been deleted." });
    }

    const now = new Date();

    // Format date
    const formatDDMMYYYY = (d) => {
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      })
        .format(d)
        .replace(/\//g, "-");
    };

    // Try to update existing record
    const updExisting = await CompanyProfile.updateOne(
      { _id: companyId, isDeleted: false, "profileViews.jobSeekerId": seeker._id },
      {
        $inc: { "profileViews.$.viewCount": 1, totalViews: 1 },
        $set: { "profileViews.$.lastViewedAt": now },
      }
    );

    const responseData = {
      companyId,
      companyName: company.companyName,
      jobSeekerProfileId: seeker._id,
      jobSeekerName: seeker.name || null,
      lastViewedAt: formatDDMMYYYY(now),
    };

    // ------------------------------------------
    // 🚀 SEND NOTIFICATION TO EMPLOYER
    // ------------------------------------------
    await createNotification(
      company.userId, // employer's userId
      "Your company profile was viewed",
      `${seeker.name || "A job seeker"} viewed your company profile.`,
      "PROFILE_VIEW"
    );

    // If already viewed before
    if (updExisting.modifiedCount === 1) {
      return res.status(200).json({
        status: true,
        message: "Profile view recorded (existing viewer).",
        data: responseData,
      });
    }

    // Add new viewer entry
    const pushNew = await CompanyProfile.updateOne(
      { _id: companyId, isDeleted: false },
      {
        $inc: { totalViews: 1 },
        $push: {
          profileViews: {
            jobSeekerId: seeker._id,
            lastViewedAt: now,
            viewCount: 1,
          },
        },
      }
    );

    if (pushNew.modifiedCount === 0) {
      return res.status(500).json({ status: false, message: "Could not record profile view." });
    }

    return res.status(200).json({
      status: true,
      message: "Profile view recorded (new viewer).",
      data: responseData,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: false,
      message: "Server error while recording profile view.",
    });
  }
};





const formatDateDDMMYYYY = (date) => {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const timeAgo = (date) => {
  const diffMs = Date.now() - new Date(date).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec} second${sec !== 1 ? "s" : ""} ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min !== 1 ? "s" : ""} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr !== 1 ? "s" : ""} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day !== 1 ? "s" : ""} ago`;
};


//get profile views of a company profile by job seeker
exports.getCompanyProfileViews = async (req, res) => {
  try {
    const { userId, role } = req.user; // from verifyToken

    // ---- ACL: only employers ----
    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Only employers can view company profile viewers.",
      });
    }

    // ---- Find employer's own active company profile ----
    const company = await CompanyProfile.findOne({ userId, isDeleted: false })
      .select("totalViews profileViews")
      .populate("profileViews.jobSeekerId", "name") // no email
      .lean();

    if (!company) {
      return res.status(404).json({
        status: false,
        message:
          "No active company profile found for this employer. Create a profile to see viewers.",
      });
    }

    // ---- Pagination by number of viewers ----
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "10", 10)));

    const allViews = Array.isArray(company.profileViews) ? company.profileViews : [];
    const sorted = allViews.sort(
      (a, b) => new Date(b.lastViewedAt) - new Date(a.lastViewedAt)
    );

    // counts
    const totalViewers = sorted.length;                              // number of unique job seekers
    const totalRecord = sorted.reduce((sum, v) => sum + (v.viewCount || 0), 0); // total views

    const totalPage = Math.max(1, Math.ceil(totalViewers / limit));
    const currentPage = Math.min(page, totalPage);
    const start = (currentPage - 1) * limit;
    const paged = sorted.slice(start, start + limit);

    return res.status(200).json({
      status: true,
      message: "Company profile views fetched successfully.",
   data: {   totalRecord,          // ✅ sum of viewCount (e.g., 2 if one seeker viewed twice)
      totalPage,            // based on number of viewers
      currentPage,
      totalViewers,         // number of unique job seekers
      profileViewers: paged.map((v) => ({
        jobSeekerProfileId: v.jobSeekerId?._id || null,
        name: v.jobSeekerId?.name || null,
        viewCount: v.viewCount,
        lastViewedDate: formatDateDDMMYYYY(v.lastViewedAt), // ✅ dd-mm-yyyy
        lastViewedAgo: timeAgo(v.lastViewedAt),             // ✅ e.g., "2 minutes ago"
      })
   )},
    });
  } catch (err) {
    console.error("Error fetching company profile viewers:", err);
    return res.status(500).json({
      status: false,
      message: "Server error while fetching company profile viewers.",
    });
  }
};


//company dashboard for website
exports.getCompanyDashboardWeb = async (req, res) => {
  try {
    const { userId, role } = req.user || {};

    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Only employers can view the dashboard.",
      });
    }

    // 1) Posted Jobs
    const basePostFilter = { userId, isDeleted: false };

    const [postedJobsCount, employerPosts] = await Promise.all([
      JobPost.countDocuments(basePostFilter),
      JobPost.find(basePostFilter).select("_id").lean(),
    ]);

    // 2) Candidates Applied
    let candidatesAppliedCount = 0;
    if (employerPosts.length) {
      const jobPostIds = employerPosts.map((p) => p._id);

      candidatesAppliedCount = await JobApplication.countDocuments({
        jobPostId: { $in: jobPostIds },
        status: "Applied",
      });
    }

    // 3) Profile Views (your required logic)
    const company = await CompanyProfile.findOne({
      userId,
      isDeleted: false,
    })
      .select("profileViews")
      .lean();

    let profileViewsTotal = 0;

    if (company && Array.isArray(company.profileViews)) {
      profileViewsTotal = company.profileViews.length; // <<< FIXED
    }

    // Response
    return res.status(200).json({
      status: true,
      message: "Employer dashboard metrics fetched successfully.",
      data: {
        postedJobs: postedJobsCount,
        candidatesApplied: candidatesAppliedCount,
        profileViews: profileViewsTotal, // <<< NOW CORRECT
      },
    });
  } catch (err) {
    console.error("getEmployerDashboard error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error while fetching dashboard metrics.",
    });
  }
};



//company dashboard for mobile
exports.getCompanyDashboard = async (req, res) => {
  try {
    const { userId, role } = req.user || {};

    // ACL — only employer can access
    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Only employers can view the dashboard.",
      });
    }

    // ----- 1) Posted jobs (exclude soft-deleted) -----
    const basePostFilter = { userId, isDeleted: false };

    // Get count and ids in parallel
    const [postedJobsCount, employerPosts] = await Promise.all([
      JobPost.countDocuments(basePostFilter),
      JobPost.find(basePostFilter).select("_id").lean(),
    ]);

    // ----- 2) Candidates applied -----
    let candidatesAppliedCount = 0;
    if (employerPosts.length) {
      const jobPostIds = employerPosts.map((p) => p._id);

      candidatesAppliedCount = await JobApplication.countDocuments({
        jobPostId: { $in: jobPostIds },
        status: "Applied",
      });
    }

    // ----- 3) Profile views (FIXED — Return only profileViews.length) -----
    const company = await CompanyProfile.findOne({
      userId,
      isDeleted: false,
    })
      .select("profileViews")
      .lean();

    let profileViewsTotal = 0;

    if (company && Array.isArray(company.profileViews)) {
      profileViewsTotal = company.profileViews.length;
    }

    // ---- Final dashboard response ----
    const dashBoard = [
      {
        id: "postedJobs",
        label: "Posted Jobs",
        value: postedJobsCount.toString(),
        icon: "briefcase",
      },
      {
        id: "candidatesApplied",
        label: "Candidates Applied",
        value: candidatesAppliedCount.toString(),
        icon: "users",
      },
      {
        id: "profileViews",
        label: "Profile Views",
        value: profileViewsTotal.toString(),
        icon: "eye",
      },
    ];

    return res.status(200).json({
      status: true,
      message: "Employer dashboard metrics fetched successfully.",
      data: { dashBoard },
    });

  } catch (err) {
    console.error("getEmployerDashboard error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error while fetching dashboard metrics.",
    });
  }
};


//company analytics
exports.getCompanyAnalytics = async (req, res) => {
  try {
    const { userId, role } = req.user || {};

    // Allow only employer
    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Only employers can view analytics.",
      });
    }

    // ----- 1) Posted jobs -----
    const basePostFilter = { userId, isDeleted: false };

    const [postedJobsCount, employerPosts] = await Promise.all([
      JobPost.countDocuments(basePostFilter),
      JobPost.find(basePostFilter).select("_id").lean(),
    ]);

    // ----- 2) Candidates applied -----
    let candidatesAppliedCount = 0;

    if (employerPosts.length) {
      const jobPostIds = employerPosts.map((p) => p._id);

      candidatesAppliedCount = await JobApplication.countDocuments({
        jobPostId: { $in: jobPostIds },
        status: "Applied",
      });
    }

    // ----- 3) Profile views (length only) -----
    const company = await CompanyProfile.findOne({
      userId,
      isDeleted: false,
    })
      .select("profileViews")
      .lean();

    let profileViewsTotal = 0;

    if (company && Array.isArray(company.profileViews)) {
      profileViewsTotal = company.profileViews.length;
    }

    // ---- Final JSON response ----
    return res.status(200).json({
      status: true,
      message: "Analytics fetched successfully",
      data: {
        postedJobs: postedJobsCount,
        candidatesApplied: candidatesAppliedCount,
        profileViews: profileViewsTotal,
      },
    });

  } catch (err) {
    console.error("getCompanyAnalytics error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error while fetching analytics.",
    });
  }
};


//get subscription
exports.getSubscription = async (req, res) => {
  try {
    const { userId, role } = req.user || {};

    // 🔐 Allow only employer
    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Only employers can view subscription plans.",
      });
    }

    const subscriptions = await Subscription.find({ isDeleted: false })
      .sort({ amount: 1 })
      .select("-__v -isDeleted")
      .lean();

    if (!subscriptions.length) {
      return res.status(200).json({
        status: true,
        message: "Plans fetched successfully.",
        data: {
          currency: "INR",
          email: "dummy@gmail.com",
          phoneNo: "1234569878",
          plans: [],
        },
      });
    }

    const maxAmount = Math.max(...subscriptions.map((s) => s.amount));

    const plans = subscriptions.map((plan, index) => ({
      id: plan._id,
      planName:
        index === 0
          ? "Basic"
          : index === 1
          ? "Premium"
          : `Plan ${index + 1}`,
      price: plan.amount,
      duration:
        plan.subscriptionMonth === 1
          ? "Month"
          : `${plan.subscriptionMonth} Months`,
      isPopular: plan.amount === maxAmount,

      // ✅ Features from DB
      features: plan.features.map((feature) => ({
        icon: feature.icon,
        title: feature.title,
      })),
    }));

    return res.status(200).json({
      status: true,
      message: "Plans fetched successfully.",
      data: {
        currency: "INR",
        email: "dummy@gmail.com",
        phoneNo: "1234569878",
        plans,
      },
    });
  } catch (error) {
    console.error("getSubscription error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
    });
  }
};






















