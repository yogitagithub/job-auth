const JobSeekerProfile = require("../models/JobSeekerProfile");
const IndustryType = require("../models/AdminIndustry");
const JobProfile = require("../models/AdminJobProfile");
const StateCity = require("../models/StateCity");

const JobSeekerEducation = require("../models/Education");
const WorkExperience = require("../models/WorkExperience");
const JobSeekerSkill = require("../models/JobSeekerSkill");
const Resume = require("../models/Resume");

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const mongoose = require("mongoose");



exports.saveProfile = async (req, res) => {
  try {
    const { userId, role, phoneNumber } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can create or update their profiles."
      });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        status: false,
        message: "No fields provided to create or update."
      });
    }

    // Fetch existing profile early (needed for soft-delete check & city-only updates)
    let profile = await JobSeekerProfile.findOne({ userId });

    // ⛔ Block updates if profile exists but is soft-deleted
    if (profile && profile.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This job seeker profile is already soft deleted and cannot be updated."
      });
    }

    // ---------- industryType (optional; accept name or ObjectId) ----------
    if (Object.prototype.hasOwnProperty.call(req.body, "industryType")) {
      const val = req.body.industryType;
      let doc = null;

      if (mongoose.Types.ObjectId.isValid(val)) doc = await IndustryType.findById(val);
      if (!doc && typeof val === "string") doc = await IndustryType.findOne({ name: val.trim() });

      if (!doc) {
        return res.status(400).json({
          status: false,
          message: "Invalid industry type (use valid name or id)."
        });
      }
      req.body.industryType = doc._id;
    }

    // ---------- jobProfile (optional; accept name or ObjectId) ----------
    if (Object.prototype.hasOwnProperty.call(req.body, "jobProfile")) {
      const val = req.body.jobProfile;
      let doc = null;

      if (mongoose.Types.ObjectId.isValid(val)) doc = await JobProfile.findById(val);
      if (!doc && typeof val === "string") doc = await JobProfile.findOne({ name: val.trim() });

      if (!doc) {
        return res.status(400).json({
          status: false,
          message: "Invalid job profile (use valid name or id)."
        });
      }
      req.body.jobProfile = doc._id;
    }

    // ---------- dateOfBirth (optional; accept DD-MM-YYYY, YYYY-MM-DD, ISO) ----------
    if (Object.prototype.hasOwnProperty.call(req.body, "dateOfBirth")) {
      const raw = String(req.body.dateOfBirth).trim();

      let parsed = null;
      if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
        const [dd, mm, yyyy] = raw.split("-");
        parsed = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        parsed = new Date(`${raw}T00:00:00.000Z`);
      } else if (!Number.isNaN(Date.parse(raw))) {
        parsed = new Date(raw);
      }

      if (!parsed || Number.isNaN(parsed.getTime())) {
        return res.status(400).json({
          status: false,
          message: "Invalid dateOfBirth. Use DD-MM-YYYY or YYYY-MM-DD."
        });
      }
      req.body.dateOfBirth = parsed;
    }

    // ---------- state & city (optional, flexible) ----------
    const hasState = Object.prototype.hasOwnProperty.call(req.body, "state");
    const hasCity  = Object.prototype.hasOwnProperty.call(req.body, "city");

    const resolveState = async (input) => {
      if (mongoose.Types.ObjectId.isValid(input)) return StateCity.findById(input);
      return StateCity.findOne({ state: input });
    };

    // Case A: state provided (with or without city)
    if (hasState) {
      const stateDoc = await resolveState(req.body.state);
      if (!stateDoc) {
        return res.status(400).json({ status: false, message: "Invalid state." });
      }

      if (hasCity) {
        if (!req.body.city || !stateDoc.cities.includes(req.body.city)) {
          return res.status(400).json({
            status: false,
            message: "Invalid city for the selected state."
          });
        }
      } else {
        // state-only update: clear existing city if no longer valid
        const existingCity = profile?.city;
        if (existingCity && !stateDoc.cities.includes(existingCity)) {
          req.body.city = null;
        }
      }

      req.body.state = stateDoc._id; // store ObjectId
    }

    // Case B: only city provided (no state in body)
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
          message: "Cannot update city because state is missing in profile."
        });
      }

      const stateDoc = await StateCity.findById(profile.state);
      if (!stateDoc) {
        return res.status(400).json({
          status: false,
          message: "Stored state not found."
        });
      }
      if (!req.body.city || !stateDoc.cities.includes(req.body.city)) {
        return res.status(400).json({
          status: false,
          message: "Invalid city for the stored state."
        });
      }
    }



    // ---------- experience/salary rules ----------
const hasIsExperienced = Object.prototype.hasOwnProperty.call(req.body, "isExperienced");
const hasSalary       = Object.prototype.hasOwnProperty.call(req.body, "CurrentSalary");

// Normalize incoming values if present
if (hasIsExperienced) {
  const v = String(req.body.isExperienced).toLowerCase();
  req.body.isExperienced = (v === "true" || v === "1" || v === "yes");
}
if (hasSalary && req.body.CurrentSalary !== null && req.body.CurrentSalary !== "") {
  const n = Number(req.body.CurrentSalary);
  if (!Number.isFinite(n) || n < 0) {
    return res.status(400).json({ status: false, message: "CurrentSalary must be a non-negative number." });
  }
  req.body.CurrentSalary = n;
}

// Determine the effective next value of isExperienced for this request
const nextIsExperienced =
  hasIsExperienced ? req.body.isExperienced : (profile?.isExperienced ?? false);

// 1) Fresher must NOT send salary
if (nextIsExperienced === false && hasSalary && req.body.CurrentSalary != null) {
  return res.status(400).json({
    status: false,
    message: "Fresher candidates must not provide CurrentSalary."
  });
}

// 2) Experienced must HAVE salary
//    - On create and when switching from fresher->experienced in this request,
//      salary must be provided in body.
//    - On update where already experienced, we allow leaving salary unchanged.
const wasExperienced = !!profile?.isExperienced;
const isTurningExperiencedNow = (nextIsExperienced === true && wasExperienced === false);

if (nextIsExperienced === true) {
  const effectiveSalary =
    hasSalary ? req.body.CurrentSalary : (profile ? profile.CurrentSalary : undefined);

  if (isTurningExperiencedNow && (effectiveSalary == null)) {
    return res.status(400).json({
      status: false,
      message: "CurrentSalary is required when marking profile as experienced."
    });
  }
}

// 3) If user explicitly sets fresher, clear salary
if (nextIsExperienced === false) {
  // ensure we don't persist a salary for freshers
  delete req.body.CurrentSalary;
  if (profile && profile.CurrentSalary != null) {
    profile.CurrentSalary = undefined;
  }
}


    // ---------- Create or Update (partial allowed) ----------
    const restrictedFields = ["_id", "userId", "phoneNumber", "__v", "image", "isDeleted", "deletedAt", "isResumeAdded", "isEducationAdded", "isSkillsAdded", "isExperienceAdded"];
    const isCreate = !profile;

    if (isCreate) {
      profile = new JobSeekerProfile({
        userId,
        phoneNumber,

         isResumeAdded:     false,
    isEducationAdded:  false,
    isSkillsAdded:     false,
    isExperienceAdded: false,


        ...Object.keys(req.body).reduce((acc, k) => {
          if (!restrictedFields.includes(k)) acc[k] = req.body[k];
          return acc;
        }, {})
      });
      await profile.save();
    } else {
      Object.keys(req.body).forEach((field) => {
        if (!restrictedFields.includes(field)) {
          profile[field] = req.body[field];
        }
      });
      await profile.save();
    }

    // ---------- Populate & respond ----------
    const populated = await JobSeekerProfile.findById(profile._id)
      .populate("industryType", "name")
      .populate("state", "state")
      .populate("jobProfile", "name");

    return res.status(200).json({
      status: true,
      message: `Job seeker profile ${isCreate ? "created" : "updated"} successfully.`,
      data: {
        ...populated.toObject(),
        industryType: populated.industryType?.name || null,
        state: populated.state?.state || null,
        jobProfile: populated.jobProfile?.name || null,
        city: populated.city ?? null,
        dateOfBirth: populated.dateOfBirth
          ? populated.dateOfBirth.toISOString().split("T")[0]
          : null,

           isResumeAdded:     !!populated.isResumeAdded,
        isEducationAdded:  !!populated.isEducationAdded,
        isSkillsAdded:     !!populated.isSkillsAdded,
        isExperienceAdded: !!populated.isExperienceAdded
      }
    });
  } catch (error) {
    console.error("Error creating/updating job seeker profile:", error);
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

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view their profiles."
      });
    }

    // fetch the profile (don't filter isDeleted so we can detect explicitly)
    const profile = await JobSeekerProfile.findOne({ userId })
      .populate("industryType", "name")
      .populate("jobProfile", "name")
      .populate("state", "state");

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Job seeker profile not found."
      });
    }

    if (profile.isDeleted === true) {
      return res.status(410).json({
        status: false,
        message: "This profile has been soft deleted and cannot be viewed."
      });
    }

    // ---- Compute section-completion flags from child collections ----
    const [eduCount, expCount, jssDoc, resumeDoc] = await Promise.all([
      JobSeekerEducation.countDocuments({ userId, isDeleted: false }),
      WorkExperience.countDocuments({ userId, isDeleted: false }),
      JobSeekerSkill.findOne({ userId, isDeleted: false }).select("skillIds").lean(),
      Resume.findOne({ userId, isDeleted: false }).select("_id").lean()
    ]);

    const skillsCount       = Array.isArray(jssDoc?.skillIds) ? jssDoc.skillIds.length : 0;
    const isEducationAdded  = eduCount  > 0;
    const isExperienceAdded = expCount  > 0;
    const isSkillsAdded     = skillsCount >= 3;   // use >0 if "any skill" should be true
    const isResumeAdded     = !!resumeDoc;

    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const day = String(d.getUTCDate()).padStart(2, "0");
      const month = String(d.getUTCMonth() + 1).padStart(2, "0");
      const year = d.getUTCFullYear();
      return `${year}-${month}-${day}`;
    };

    const p = profile.toObject();

    return res.status(200).json({
      status: true,
      message: "Job seeker profile fetched successfully.",
      data: {
        id: p._id,
        userId: p.userId,
        phoneNumber: p.phoneNumber,
        name: p.name,
        dateOfBirth: formatDate(p.dateOfBirth),
        gender: p.gender,
        email: p.email,
        industryType: p.industryType?.name || null,
        jobProfile: p.jobProfile?.name || null,
        address: p.address,
        state: p.state?.state || null,
        city: p.city,
        pincode: p.pincode,
        panCardNumber: p.panCardNumber,
        alternatePhoneNumber: p.alternatePhoneNumber,
        image: p.image,


        // profile fields you asked to include
        isExperienced: !!p.isExperienced,
        CurrentSalary: p.isExperienced ? (typeof p.CurrentSalary === "number" ? p.CurrentSalary : null) : null,

        // ✅ flags computed from actual data
        isResumeAdded,
        isEducationAdded,
        isSkillsAdded,
        isExperienceAdded
      }
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



exports.updateProfileImage = async (req, res) => {
  try {
    const { userId, role } = req.user;

     console.log("Incoming Request User:", req.user);
    console.log("Uploaded File Details:", req.file);

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can update their profile image."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: false,
        message: "Image file is required."
      });
    }

    const profile = await JobSeekerProfile.findOne({ userId });
     console.log("Fetched Profile from DB:", profile);

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Job seeker profile not found."
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
        console.log("⚠ No old image to delete or same filename uploaded");
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
      message: "Job seeker profile image updated successfully. Old image deleted if it existed.",
      data: {
        image: newImagePath
      }
    });


  } catch (error) {
    console.error("Error updating job seeker profile image:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};



exports.getProfileImage = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can fetch their profile image."
      });
    }

    const profile = await JobSeekerProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Job seeker profile not found."
      });
    }

    return res.status(200).json({
      status: true,
      message: "Job seeker profile image fetched successfully.",
      data: {
        image: profile.image || null
      }
    });
  } catch (error) {
    console.error("Error fetching job seeker profile image:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};



exports.deleteProfile = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { id } = req.body;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can delete their profiles."
      });
    }

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: false,
        message: "Valid profile ID is required."
      });
    }

    // Load the profile
    const profile = await JobSeekerProfile.findById(id);

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Job seeker profile not found."
      });
    }

    // AuthZ check
    if (profile.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to delete this profile."
      });
    }

    // Already soft-deleted?
    if (profile.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This profile is already soft deleted."
      });
    }

    // Soft delete
    profile.isDeleted = true;
    await profile.save();

    return res.status(200).json({
      status: true,
      message: "Job seeker profile deleted successfully (soft delete)."
    });
  } catch (error) {
    console.error("Error deleting job seeker profile:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};



// without token
exports.getAllJobSeekers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Count only non-deleted companies
    const totalSeekers = await JobSeekerProfile.countDocuments({ isDeleted: false });

    const seekers = await JobSeekerProfile.find({ isDeleted: false }) // ✅ filter here
      .populate("industryType", "name")
         .populate("jobProfile", "name")
      .populate("state", "state")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    if (!seekers || seekers.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No job seekers profiles found."
      });
    }

    const responseData = seekers.map(seeker => ({
      id: seeker._id,
      userId: seeker.userId,
      phoneNumber: seeker.phoneNumber,
      jobSeekerName: seeker.companyName,
      industryType: seeker.industryType?.name || null,
jobProfile: seeker.jobProfile?.name || null,

      // contactPersonName: seeker.contactPersonName,

      panCardNumber: seeker.panCardNumber,
      // gstNumber: seeker.gstNumber,
      alternatePhoneNumber: seeker.alternatePhoneNumber,

       dateOfBirth: seeker.dateOfBirth 
        ? seeker.dateOfBirth.toISOString().split("T")[0] // ✅ formats as "YYYY-MM-DD"
        : null,

        
      email: seeker.email,
      gender: seeker.gender,
      address: seeker.address,
      state: seeker.state?.state || null,
      city: seeker.city,
      pincode: seeker.pincode,
      image: seeker.image
    }));

    return res.json({
      status: true,
      message: "Job seekers profiles fetched successfully.",
      totalSeekers,
      currentPage: page,
      totalPages: Math.ceil(totalSeekers / limit),
      data: responseData
    });
  } catch (error) {
    console.error("Error fetching job seekers:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};


//admin recommended job seeker profiles
exports.adminRecommendJobSeeker = async (req, res) => {
  try {
    const { role } = req.user || {};
    if (role !== "admin") {
      return res.status(403).json({ status: false, message: "Only admin can recommend job profiles." });
    }

    const { id, adminRecommendJobSeeker } = req.body || {};
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid job profile id is required." });
    }

    const profile = await JobSeekerProfile.findById(id);

    // 1) Not found
    if (!profile) {
      return res.status(404).json({ status: false, message: "Job profile not found." });
    }

    // 2) Found but already soft-deleted
    if (profile.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This job profile has been soft deleted and cannot be recommended."
      });
    }

    // Default to true (recommend) if omitted
    const nextVal = (typeof adminRecommendJobSeeker === "boolean") ? adminRecommendJobSeeker : true;

   

      // If recommending (true), ensure all sections are completed
    if (nextVal === true) {
      const requiredFlags = ["isExperienceAdded", "isSkillsAdded", "isEducationAdded", "isResumeAdded"];
      const missing = requiredFlags.filter(flag => !profile[flag]);

      if (missing.length > 0) {
        return res.status(409).json({
          status: false,
          message: "Cannot recommend: the following sections are incomplete.",
          missingSections: missing
        });
      }
    }


       // Idempotent response
    if (profile.adminRecommendedSeeker === nextVal) {
      return res.status(200).json({
        status: true,
        message: nextVal
          ? "Profile is already marked as admin-recommended."
          : "Profile recommendation is already revoked.",
        data: {
          id: profile._id,
          adminRecommendedSeeker: profile.adminRecommendedSeeker
        }
      });
    }



    profile.adminRecommendedSeeker = nextVal;
    await profile.save();    



    return res.status(200).json({
      status: true,
      message: nextVal ? "Profile marked as admin-recommended." : "Profile recommendation revoked.",
      data: {
        id: profile._id,
        adminRecommendedSeeker: profile.adminRecommendedSeeker
      }
    });


  } catch (err) {
    console.error("adminRecommendJobSeeker error:", err);
    return res.status(500).json({ 
      status: false, 
      message: "Server error", error: err.message 
    });
  }
};




//admin top job seeker profiles
exports.adminTopJobSeeker = async (req, res) => {
  try {
    const { role, userId: adminId } = req.user || {};
    if (role !== "admin") {
      return res.status(403).json({ status: false, message: "Only admin can mark top profiles." });
    }

    const { id, adminTopProfiles } = req.body || {};
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid job seeker profile id is required." });
    }

    // Default to true if omitted
    const nextVal = (typeof adminTopProfiles === "boolean") ? adminTopProfiles : true;

    // Fetch once for soft-delete & idempotency checks
    const profile = await JobSeekerProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ status: false, message: "Job seeker profile not found." });
    }
    if (profile.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This job seeker profile is soft-deleted and cannot be updated."
      });
    }

    // Idempotent response
    if (profile.adminTopProfiles === nextVal) {
      return res.status(200).json({
        status: true,
        message: nextVal
          ? "Profile is already in the admin top list."
          : "Profile is already removed from the admin top list.",
        data: { id: profile._id, adminTopProfiles: profile.adminTopProfiles }
      });
    }

    if (nextVal === true) {
      // ATOMIC: only set to true if all completion flags are already true and not deleted
      const updated = await JobSeekerProfile.findOneAndUpdate(
        {
          _id: id,
          isDeleted: false,
          isExperienceAdded: true,
          isSkillsAdded: true,
          isEducationAdded: true,
          isResumeAdded: true
        },
        { $set: { adminTopProfiles: true /*, topSetBy: adminId, topSetAt: new Date()*/ } },
        { new: true }
      );

      if (!updated) {
        // Give a helpful error about which flags are missing
        const reqFlags = ["isExperienceAdded", "isSkillsAdded", "isEducationAdded", "isResumeAdded"];
        const missing = reqFlags.filter(f => !profile[f]);
        return res.status(409).json({
          status: false,
          message: "Cannot mark as top: the following sections are incomplete.",
          missingSections: missing
        });
      }

      return res.status(200).json({
        status: true,
        message: "Profile marked as admin top profile.",
        data: { id: updated._id, adminTopProfiles: updated.adminTopProfiles }
      });
    }

    // nextVal === false -> revoke (no flag requirements)
    profile.adminTopProfiles = false;
    await profile.save();

    return res.status(200).json({
      status: true,
      message: "Profile removed from admin top list.",
      data: { id: profile._id, adminTopProfiles: profile.adminTopProfiles }
    });

  } catch (err) {
    console.error("adminTopJobSeeker error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};




const pickName = (obj) => obj?.name ?? obj?.title ?? obj?.label ?? null;


const formatDDMMYYYY = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

//get recommended job profile list for employers only
exports.getRecommendedProfiles = async (req, res) => {
  try {
    const { role } = req.user || {};
    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can access recommended job seeker profiles."
      });
    }

    // pagination
    const page  = Math.max(parseInt(req.query.page, 10)  || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip  = (page - 1) * limit;

    // base filter: recommended + active (not soft-deleted)
    const filter = { adminRecommendedSeeker: true, isDeleted: false };

    // count
    const totalRecord = await JobSeekerProfile.countDocuments(filter);
    const totalPage   = Math.max(Math.ceil(totalRecord / limit), 1);

    // query
    const profiles = await JobSeekerProfile.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(`
        userId image name gender email phoneNumber dateOfBirth
        isExperienced CurrentSalary state city industryType jobProfile
        isResumeAdded isEducationAdded isSkillsAdded isExperienceAdded
        adminRecommendedSeeker alternatePhoneNumber panCardNumber address pincode
      `)
      .populate("industryType", "name")
      .populate("jobProfile", "name title label")
      .populate("state", "state name") // supports either field in your StateCity model
      .lean();

    // shape payload
    const data = profiles.map(p => ({
      _id: p._id,
      userId: p.userId,
      image: p.image ?? null,
      name: p.name ?? null,
      gender: p.gender ?? null,
      dob: formatDDMMYYYY(p.dateOfBirth),
      isExperienced: !!p.isExperienced,
      currentSalary: p.CurrentSalary ?? null,

        alternatePhoneNumber: p.alternatePhoneNumber ?? null,
      panCardNumber: p.panCardNumber ?? null,

      // location
       address: p.address ?? null,
        pincode: p.pincode ?? null,
      state: p.state?.state ?? p.state?.name ?? null,
      city: p.city ?? null,

      // meta / taxonomy
      industryType: pickName(p.industryType),
      jobProfile: pickName(p.jobProfile),

      // completion flags (useful for UI)
      isResumeAdded: !!p.isResumeAdded,
      isEducationAdded: !!p.isEducationAdded,
      isSkillsAdded: !!p.isSkillsAdded,
      isExperienceAdded: !!p.isExperienceAdded,

      adminRecommendedSeeker: !!p.adminRecommendedSeeker,
     

      // expose contact if your product rules allow it:
      email: p.email ?? null,
      phoneNumber: p.phoneNumber ?? null
    }));

    return res.status(200).json({
      status: true,
      message: "Recommended job seeker profiles fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("getRecommendedProfiles error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};



//get top job profile list for employers only
exports.getTopProfiles = async (req, res) => {
  try {
    const { role } = req.user || {};
    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can access recommended job seeker profiles."
      });
    }

    // pagination
    const page  = Math.max(parseInt(req.query.page, 10)  || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip  = (page - 1) * limit;

    // base filter: top + active (not soft-deleted)
    const filter = { adminTopProfiles: true, isDeleted: false };

    // count
    const totalRecord = await JobSeekerProfile.countDocuments(filter);
    const totalPage   = Math.max(Math.ceil(totalRecord / limit), 1);

    // query
    const profiles = await JobSeekerProfile.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(`
        userId image name gender email phoneNumber dateOfBirth
        isExperienced CurrentSalary state city industryType jobProfile
        isResumeAdded isEducationAdded isSkillsAdded isExperienceAdded
        adminRecommendedSeeker alternatePhoneNumber panCardNumber address pincode
      `)
      .populate("industryType", "name")
      .populate("jobProfile", "name title label")
      .populate("state", "state name") // supports either field in your StateCity model
      .lean();

    // shape payload
    const data = profiles.map(p => ({
      _id: p._id,
      userId: p.userId,
      image: p.image ?? null,
      name: p.name ?? null,
      gender: p.gender ?? null,
      dob: formatDDMMYYYY(p.dateOfBirth),
      isExperienced: !!p.isExperienced,
      currentSalary: p.CurrentSalary ?? null,

        alternatePhoneNumber: p.alternatePhoneNumber ?? null,
      panCardNumber: p.panCardNumber ?? null,

      // location
       address: p.address ?? null,
        pincode: p.pincode ?? null,
      state: p.state?.state ?? p.state?.name ?? null,
      city: p.city ?? null,

      // meta / taxonomy
      industryType: pickName(p.industryType),
      jobProfile: pickName(p.jobProfile),

      // completion flags (useful for UI)
      isResumeAdded: !!p.isResumeAdded,
      isEducationAdded: !!p.isEducationAdded,
      isSkillsAdded: !!p.isSkillsAdded,
      isExperienceAdded: !!p.isExperienceAdded,

      adminRecommendedSeeker: !!p.adminRecommendedSeeker,
     

      // expose contact if your product rules allow it:
      email: p.email ?? null,
      phoneNumber: p.phoneNumber ?? null
    }));

    return res.status(200).json({
      status: true,
      message: "Top job seeker profiles fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("getTopProfiles error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};




//get progress bar for job seeker profile completion
exports.getProfileProgress = async (req, res) => {
  try {
    const { userId, role } = req.user; // coming from verifyToken

    // Restrict access: only job seekers allowed
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Only job seekers can view profile progress.",
      });
    }

    const profile = await JobSeekerProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Profile not found.",
      });
    }


       // Check if soft deleted
    if (profile.isDeleted) {
      return res.status(409).json({   // 409 Conflict is good for "disabled" state
        status: false,
        message: "Your profile is currently disabled.",
      });
    }

    let completedSections = 0;

    // ✅ 1. Basic profile check
    const basicFields = [
      "name",
      "phoneNumber",
      "email",
      "dateOfBirth",
      "gender",
      "state",
      "city",
      "pincode",
      "industryType",
      "jobProfile",
    ];

    const hasBasic = basicFields.every(field => profile[field]);
    if (hasBasic) completedSections++;

    // ✅ 2. Work experience
    if (profile.isExperienceAdded) completedSections++;

    // ✅ 3. Education
    if (profile.isEducationAdded) completedSections++;

    // ✅ 4. Skills
    if (profile.isSkillsAdded) completedSections++;

    // ✅ 5. Resume
    if (profile.isResumeAdded) completedSections++;

    // ✅ Calculate % (5 sections = 100%)
    const progressPercent = `${Math.round((completedSections / 5) * 100)}%`;


    return res.status(200).json({
      status: true,
      message: "Profile progress fetched successfully.",
      progress: progressPercent,
     
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};
