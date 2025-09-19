const CompanyProfile = require("../models/CompanyProfile");
const IndustryType = require("../models/AdminIndustry");
const JobSeekerProfile  = require("../models/JobSeekerProfile");
const StateCity = require("../models/StateCity");


const JobPost = require("../models/JobPost");
const JobApplication = require("../models/JobApplication");

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

    // Compute a reliable BASE URL (uses env, falls back to request host)
    const baseUrl =
      (process.env.BASE_URL && process.env.BASE_URL.replace(/\/$/, "")) ||
      `${req.protocol}://${req.get("host")}`;

    const hasAnyBody = req.body && Object.keys(req.body).length > 0;
    const hasFile = !!req.file;

    // Load existing profile early
    let profile = await CompanyProfile.findOne({ userId });

    // Soft-deleted guard
    if (profile && profile.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This company profile has been soft deleted and cannot be updated."
      });
    }

    // Normalize aboutCompany if present
    if (Object.prototype.hasOwnProperty.call(req.body, "aboutCompany")) {
      const v = req.body.aboutCompany;
      req.body.aboutCompany = v && String(v).trim() ? String(v).trim() : null;
    }

    // ---- Normalize gstNumber if present (treat empty as null) ----
    const gstProvidedThisRequest = Object.prototype.hasOwnProperty.call(req.body, "gstNumber");
    if (gstProvidedThisRequest) {
      const v = req.body.gstNumber;
      req.body.gstNumber = v && String(v).trim() ? String(v).trim() : null;
    }

    // ---------- industryType (optional) ----------
    if (Object.prototype.hasOwnProperty.call(req.body, "industryType")) {
      const val = req.body.industryType;
      let industryDoc = null;

      if (mongoose.Types.ObjectId.isValid(val)) {
        industryDoc = await IndustryType.findById(val);
      }
      if (!industryDoc && typeof val === "string") {
        industryDoc = await IndustryType.findOne({ name: val.trim() });
      }
      if (!industryDoc) {
        return res.status(400).json({
          status: false,
          message: "Invalid industry type (use valid name or id)."
        });
      }
      req.body.industryType = industryDoc._id;
    }

    // ---------- state & city (optional) ----------
    const hasState = Object.prototype.hasOwnProperty.call(req.body, "state");
    const hasCity  = Object.prototype.hasOwnProperty.call(req.body, "city");

    const resolveState = async (input) => {
      if (mongoose.Types.ObjectId.isValid(input)) return StateCity.findById(input);
      return StateCity.findOne({ state: input });
    };

    if (hasState) {
      const stateDoc = await resolveState(req.body.state);
      if (!stateDoc) return res.status(400).json({ status: false, message: "Invalid state." });

      if (hasCity) {
        if (!req.body.city || !stateDoc.cities.includes(req.body.city)) {
          return res.status(400).json({ status: false, message: "Invalid city for the selected state." });
        }
      } else {
        const existingCity = profile?.city;
        if (existingCity && !stateDoc.cities.includes(existingCity)) {
          req.body.city = null; // clear invalid city
        }
      }
      req.body.state = stateDoc._id; // store ObjectId
    }

    if (!hasState && hasCity) {
      if (!profile) {
        return res.status(400).json({
          status: false,
          message: "Cannot set only city on create. Provide state as well."
        });
      }
      if (!profile.state) {
        return res.status(400).json({
          status: false,
          message: "Cannot set city because state is missing in profile."
        });
      }
      const stateDoc = await StateCity.findById(profile.state);
      if (!stateDoc || !stateDoc.cities.includes(req.body.city)) {
        return res.status(400).json({
          status: false,
          message: "Invalid city for the stored state."
        });
      }
    }

    // ---------- ENFORCE GST rules ----------
    const oldGst = profile?.gstNumber || null;
    const newGst = gstProvidedThisRequest ? req.body.gstNumber : oldGst;
    const clearingGst = gstProvidedThisRequest && !req.body.gstNumber;
    const gstChanged = gstProvidedThisRequest && newGst !== oldGst;

    // Rule C: If a certificate file is uploaded in this request, a *gstNumber must be provided in this request*.
    // (Blocks "certificate only" uploads.)
    if (hasFile && !gstProvidedThisRequest) {
      return res.status(400).json({
        status: false,
        message: "Please provide 'gstNumber' along with the certificate upload."
      });
    }

    // Rule A: If GST is present after this request (not cleared), a certificate must exist
    if ((newGst || oldGst) && !clearingGst) {
      const hasExistingCert = !!profile?.gstCertificate?.fileUrl;
      if (!hasFile && !hasExistingCert) {
        return res.status(400).json({
          status: false,
          message: "GST certificate is required when GST number is set. Upload the file."
        });
      }
    }

    // Rule B: If GST number is UPDATED in this request, a NEW certificate upload is mandatory
    if (gstChanged && !hasFile) {
      return res.status(400).json({
        status: false,
        message: "You are updating GST number. Please upload the NEW GST certificate also."
      });
    }

    // ---------- Build updates ----------
    const restricted = ["_id", "userId", "phoneNumber", "__v", "image", "isDeleted", "deletedAt"];
    const bodyUpdates = Object.keys(req.body || {}).reduce((acc, k) => {
      if (!restricted.includes(k)) acc[k] = req.body[k];
      return acc;
    }, {});

    // Prepare new certificate subdoc if file uploaded (store ABSOLUTE URL)
    let newCertificate = null;
    if (hasFile) {
      newCertificate = {
        fileUrl: `${baseUrl}/uploads/certificates/${req.file.filename}`,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        uploadedAt: new Date()
      };
    }

    const isCreate = !profile;

    if (isCreate) {
      if (!hasAnyBody && !newCertificate) {
        return res.status(400).json({ status: false, message: "No data provided to create profile." });
      }

      profile = new CompanyProfile({
        userId,
        phoneNumber,
        ...bodyUpdates,
        ...(newCertificate && { gstCertificate: newCertificate })
      });
      await profile.save();
    } else {
      // If replacing file, delete old file from disk (best-effort)
      if (newCertificate && profile.gstCertificate?.fileUrl) {
        try {
          // old fileUrl may be absolute; get its pathname to find local file
          let pathname;
          try { pathname = new URL(profile.gstCertificate.fileUrl).pathname; }
          catch { pathname = profile.gstCertificate.fileUrl; } // fallback if relative
          if (pathname.startsWith("/uploads/certificates/")) {
            const absolute = path.join(process.cwd(), pathname.replace(/^\//, ""));
            await fsp.unlink(absolute).catch(() => {});
          }
        } catch (_) { /* ignore fs issues */ }
      }

      Object.assign(profile, bodyUpdates);
      if (newCertificate) profile.gstCertificate = newCertificate;
      await profile.save();
    }

    // --------- Fetch, shape, and respond (hide meta; flatten gstCertificate) ----------
    const populated = await CompanyProfile.findById(profile._id)
      .select("-__v -createdAt -updatedAt -isDeleted")
      .populate("state", "state")
      .populate("industryType", "name")
      .lean();

    const data = {
      ...populated,
      gstCertificate: populated.gstCertificate
        ? (populated.gstCertificate.fileUrl?.startsWith("http")
            ? populated.gstCertificate.fileUrl
            : `${baseUrl}${populated.gstCertificate.fileUrl}`)
        : null,
      state: populated.state?.state || null,
      industryType: populated.industryType?.name || null
    };

    return res.status(200).json({
      status: true,
      message: `Company profile ${isCreate ? "created" : "updated"} successfully.`,
      data
    });
  } catch (error) {
    console.error("Error creating/updating company profile:", error);
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

    // Fetch without filtering isDeleted so we can detect soft-deleted state
    const profile = await CompanyProfile.findOne({ userId })
      .populate("industryType", "name")
      .populate("state", "state");

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found."
      });
    }

    // If soft-deleted, send 400 with explicit message
    if (profile.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This company profile has been already soft deleted."
      });
    }

    const p = profile.toObject();

     // Flatten to a single string URL (or null)
    const certUrl = p.gstCertificate?.fileUrl
      ? (p.gstCertificate.fileUrl.startsWith("http")
          ? p.gstCertificate.fileUrl
          : `${baseUrl}${p.gstCertificate.fileUrl}`)
      : null;


    const responseData = {
      id: p._id,
      userId: p.userId,
      phoneNumber: p.phoneNumber,
      companyName: p.companyName,
      industryType: p.industryType?.name || null,
      contactPersonName: p.contactPersonName,
      panCardNumber: p.panCardNumber,
      gstNumber: p.gstNumber,
      gstCertificate: certUrl,
      alternatePhoneNumber: p.alternatePhoneNumber,
      email: p.email,
      companyAddress: p.companyAddress,
      state: p.state?.state || null,
      city: p.city,
      pincode: p.pincode,
      image: p.image || null,
       aboutCompany: p.aboutCompany ?? null
    };

    return res.status(200).json({
      status: true,
      message: "Company profile fetched successfully.",
      data: responseData
    });
  } catch (error) {
    console.error(error);
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
        message: "This company profile is already soft deleted."
      });
    }

    // Soft delete
    profile.isDeleted = true;
    profile.deletedAt = new Date(); // will be saved only if 'deletedAt' exists in schema
    await profile.save();

    return res.status(200).json({
      status: true,
      message: "Company profile soft deleted successfully."
    });
  } catch (error) {
    console.error("Error soft deleting company profile:", error);
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
    const newImagePath = `${baseUrl}/uploads/images/${req.file.filename}`;
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
    const FIELDS = [
      "phoneNumber",
      "companyName",
      "industryType",
      "contactPersonName",
      "panCardNumber",
      "gstNumber",
      // nested gstCertificate: count if fileUrl present
      "gstCertificate.fileUrl",
      "alternatePhoneNumber",
      "email",
      "companyAddress",
      "state",
      "city",
      "pincode",
      "image",
      "aboutCompany",
    ];

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

   const progress = `${Math.round((filled / total) * 100)}%`; // string with %


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

    // NEW: pull the caller's JobSeekerProfile _id and name
    const seeker = await JobSeekerProfile.findOne({ userId })
      .select("_id name")
      .lean();
    if (!seeker) {
      return res.status(404).json({
        status: false,
        message: "Job seeker profile not found for this user.",
      });
    }

    // NEW: get company name + isDeleted up front (and reuse for response)
    const company = await CompanyProfile.findById(companyId)
      .select("_id companyName isDeleted")
      .lean();

    if (!company) {
      return res.status(404).json({ status: false, message: "Company profile not found." });
    }
    if (company.isDeleted) {
      return res.status(410).json({ status: false, message: "This company profile has been deleted." });
    }

    const now = new Date();

    // helper to format dd-mm-yyyy (UTC; switch to 'Asia/Kolkata' if you prefer IST)
    const formatDDMMYYYY = (d) => {
      // Using en-GB gives dd/mm/yyyy; convert slashes to dashes
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      })
        .format(d)
        .replace(/\//g, "-");
    };

    // 1) try to update existing subdoc (positional $)
    const updExisting = await CompanyProfile.updateOne(
      { _id: companyId, isDeleted: false, "profileViews.jobSeekerId": seeker._id },
      {
        $inc: { "profileViews.$.viewCount": 1, totalViews: 1 },
        $set: { "profileViews.$.lastViewedAt": now },
      }
    );

    const responseData = {
      companyId,
      companyName: company.companyName,             // NEW
      jobSeekerProfileId: seeker._id,
      jobSeekerName: seeker.name || null,           // NEW
      lastViewedAt: formatDDMMYYYY(now),            // NEW (formatted)
    };

    if (updExisting.modifiedCount === 1) {
      return res.status(200).json({
        status: true,
        message: "Profile view recorded (existing viewer).",
        data: responseData,
      });
    }

    // 2) not present -> push new viewer entry
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
    return res.status(500).json({ status: false, message: "Server error while recording profile view." });
  }
};

// exports.recordCompanyProfileView = async (req, res) => {
//   try {
//     const { companyId } = req.params;
//     const { userId, role } = req.user; // from verifyToken

//     if (role !== "job_seeker") {
//       return res.status(403).json({
//         status: false,
//         message: "Only job seekers can record company profile views.",
//       });
//     }

//     if (!mongoose.isValidObjectId(companyId)) {
//       return res.status(400).json({ status: false, message: "Invalid companyId." });
//     }

//     // find the caller's JobSeekerProfile _id
//     const seeker = await JobSeekerProfile.findOne({ userId }).select("_id").lean();
//     if (!seeker) {
//       return res.status(404).json({
//         status: false,
//         message: "Job seeker profile not found for this user.",
//       });
//     }

//     const now = new Date();

//     // 1) try to update existing subdoc (positional $)
//     const updExisting = await CompanyProfile.updateOne(
//       { _id: companyId, isDeleted: false, "profileViews.jobSeekerId": seeker._id },
//       {
//         $inc: { "profileViews.$.viewCount": 1, totalViews: 1 },
//         $set: { "profileViews.$.lastViewedAt": now },
//       }
//     );

//     if (updExisting.modifiedCount === 1) {
//       return res.status(200).json({
//         status: true,
//         message: "Profile view recorded (existing viewer).",
//         data: { companyId, jobSeekerProfileId: seeker._id, lastViewedAt: now },
//       });
//     }

//     // 2) not present -> push new viewer entry
//     const pushNew = await CompanyProfile.updateOne(
//       { _id: companyId, isDeleted: false },
//       {
//         $inc: { totalViews: 1 },
//         $push: {
//           profileViews: {
//             jobSeekerId: seeker._id,
//             lastViewedAt: now,
//             viewCount: 1,
//           },
//         },
//       }
//     );

//     if (pushNew.modifiedCount === 0) {
//       // either company not found or soft-deleted
//       // re-check to give better message
//       const cmp = await CompanyProfile.findById(companyId).select("isDeleted").lean();
//       if (!cmp) {
//         return res.status(404).json({ status: false, message: "Company profile not found." });
//       }
//       if (cmp.isDeleted) {
//         return res.status(410).json({ status: false, message: "This company profile has been deleted." });
//       }
//       return res.status(500).json({ status: false, message: "Could not record profile view." });
//     }

//     return res.status(200).json({
//       status: true,
//       message: "Profile view recorded (new viewer).",
//       data: { companyId, jobSeekerProfileId: seeker._id, lastViewedAt: now },
//     });
//   } catch (err) {
//     console.error(err);
//     return res.status(500).json({ status: false, message: "Server error while recording profile view." });
//   }
// };




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


//company dashboard
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

    // ----- 2) Candidates applied (only for NON-deleted posts) -----
    let candidatesAppliedCount = 0;
    if (employerPosts.length) {
      const jobPostIds = employerPosts.map((p) => p._id);
      candidatesAppliedCount = await JobApplication.countDocuments({
        jobPostId: { $in: jobPostIds },
        status: "Applied", // exclude Withdrawn
      });
    }

    // ----- 3) Profile views -----
    // Prefer the counter; fall back to summing viewCount if needed.
    const company = await CompanyProfile.findOne({ userId, isDeleted: false })
      .select("totalViews profileViews")
      .lean();

    let profileViewsTotal = 0;
    if (company) {
      if (typeof company.totalViews === "number") {
        profileViewsTotal = company.totalViews;
      } else if (Array.isArray(company.profileViews)) {
        profileViewsTotal = company.profileViews.reduce(
          (sum, v) => sum + (v.viewCount || 0),
          0
        );
      }
    }

    // ----- Response (flattened) -----
    return res.status(200).json({
      status: true,
      message: "Employer dashboard metrics fetched successfully.",
      data: {
        postedJobs: postedJobsCount,                 // only non-deleted
        candidatesApplied: candidatesAppliedCount,   // only from non-deleted posts
        profileViews: profileViewsTotal,             // total view events
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












