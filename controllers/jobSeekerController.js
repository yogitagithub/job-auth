const JobSeekerProfile = require("../models/JobSeekerProfile");
const IndustryType = require("../models/AdminIndustry");
const JobProfile = require("../models/AdminJobProfile");
const StateCity = require("../models/StateCity");
const Skill = require("../models/Skills");

const JobSeekerEducation = require("../models/Education");
const WorkExperience = require("../models/WorkExperience");
const JobSeekerSkill = require("../models/JobSeekerSkill");
const Resume = require("../models/Resume");
const Task = require("../models/Task");

const JobApplication = require("../models/JobApplication");
const JobPost = require("../models/JobPost");
const CompanyProfile = require("../models/CompanyProfile");

const SalaryType       = require("../models/AdminSalaryType");
const JobType          = require("../models/AdminJobType");
const ExperienceRange  = require("../models/AdminExperienceRange");
const WorkingShift     = require("../models/AdminWorkingShift");



const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const mongoose = require("mongoose");

const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findStateByCity = async (city) => {
  if (!city) return null;
  // Case-insensitive exact match on a city inside the cities array
  const doc = await StateCity.findOne({
    cities: { $elemMatch: { $regex: `^${escapeRegex(city)}$`, $options: "i" } }
  });
  return doc;
};

// Return the canonical city string from the doc (preserve stored casing)
const pickCanonicalCity = (stateDoc, city) => {
  if (!stateDoc?.cities?.length || !city) return city;
  const lc = city.toLowerCase();
  const hit = stateDoc.cities.find(c => String(c).toLowerCase() === lc);
  return hit || city;
};


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


      // ---------- salaryType (REQUIRED on create; accept name or ObjectId) ----------
    // allow alias "SalaryType"
    if (!req.body.salaryType && req.body.SalaryType) {
      req.body.salaryType = req.body.SalaryType;
      delete req.body.SalaryType;
    }
    // treat ""/null as not provided
    if (req.body.salaryType === "" || req.body.salaryType == null) delete req.body.salaryType;

    if (Object.prototype.hasOwnProperty.call(req.body, "salaryType")) {
      const raw = String(req.body.salaryType).trim();
      let doc = null;
      if (mongoose.Types.ObjectId.isValid(raw)) doc = await SalaryType.findById(raw);
      if (!doc) doc = await SalaryType.findOne({ name: new RegExp(`^${escapeRegex(raw)}$`, "i") });
      if (!doc) return res.status(400).json({ status: false, message: "Invalid salary type (use valid name or id)." });
      req.body.salaryType = doc._id; // store ObjectId
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
    // treat "" / null as not provided so "state": "" won't trigger invalid-state branch
    if (req.body.state === "" || req.body.state == null) delete req.body.state;
    if (req.body.city === "" || req.body.city == null) delete req.body.city;

    let hasState = Object.prototype.hasOwnProperty.call(req.body, "state");
    let hasCity = Object.prototype.hasOwnProperty.call(req.body, "city");

    const resolveState = async (input) => {
      if (mongoose.Types.ObjectId.isValid(input)) return StateCity.findById(input);
      if (typeof input === "string") {
        // case-insensitive lookup by state name
        return StateCity.findOne({ state: new RegExp(`^${escapeRegex(input)}$`, "i") });
      }
      return null;
    };

    // If ONLY city provided, infer state from city
    if (!hasState && hasCity) {
      const inputCity = String(req.body.city || "").trim();
      if (!inputCity) {
        return res.status(400).json({ status: false, message: "City is empty." });
      }

      const stateDoc = await findStateByCity(inputCity);
      if (!stateDoc) {
        return res.status(400).json({
          status: false,
          message: "Invalid city. No matching state found."
        });
      }

      // canonicalize city & inject state id
      req.body.city = pickCanonicalCity(stateDoc, inputCity);
      req.body.state = stateDoc._id;
      hasState = true;
    }

    // If state provided (with/without city), validate & standardize
    if (hasState) {
      const stateDoc = await resolveState(req.body.state);
      if (!stateDoc) {
        return res.status(400).json({ status: false, message: "Invalid state." });
      }

      if (hasCity) {
        const cityStr = String(req.body.city).trim();
        const ok = stateDoc.cities.some(
          (c) => String(c).toLowerCase() === cityStr.toLowerCase()
        );
        if (!ok) {
          return res.status(400).json({
            status: false,
            message: "Invalid city for the selected state."
          });
        }
        // use canonical city from DB
        req.body.city = pickCanonicalCity(stateDoc, cityStr);
      } else {
        // state-only update: drop existing city if it doesn't belong anymore
        const existingCity = profile?.city;
        const stillValid =
          existingCity &&
          stateDoc.cities.some((c) => String(c).toLowerCase() === String(existingCity).toLowerCase());
        if (!stillValid) {
          req.body.city = null;
        }
      }

      // Store state as ObjectId
      req.body.state = stateDoc._id;
    }


        // ---------- normalize optional empties (address, panCardNumber) ----------
    ["panCardNumber", "address"].forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        if (req.body[k] === "" || req.body[k] == null) req.body[k] = null;
      }
    });





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

    // Enforce salaryType presence on CREATE (schema requires it)
    if (isCreate && !Object.prototype.hasOwnProperty.call(req.body, "salaryType")) {
      return res.status(400).json({ status: false, message: "salaryType is required." });
    }



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
      .populate("jobProfile", "name")
       .populate("salaryType", "name");




    return res.status(200).json({
      status: true,
      message: `Job seeker profile ${isCreate ? "created" : "updated"} successfully.`,
      data: {
        ...populated.toObject(),
        industryType: populated.industryType?.name || null,
        state: populated.state?.state || null,
        jobProfile: populated.jobProfile?.name || null,
         salaryType:   populated.salaryType?.name   || null,
        city: populated.city ?? null,
        dateOfBirth: populated.dateOfBirth
          ? populated.dateOfBirth.toISOString().split("T")[0]
          : null,

             panCardNumber: populated.panCardNumber || null,
    address: populated.address || null,

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
      .populate("state", "state")
       .populate("salaryType", "name");

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
    const [eduCount, expCount, jssDoc, resumeDoc, approvedJobsCount] = await Promise.all([
      JobSeekerEducation.countDocuments({ userId, isDeleted: false }),
      WorkExperience.countDocuments({ userId, isDeleted: false }),
     
       JobSeekerSkill.findOne({ userId, isDeleted: false })
        .select("skills skillIds")
        .lean(),


      Resume.findOne({ userId, isDeleted: false }).select("_id").lean(),
       JobApplication.countDocuments({ userId, employerApprovalStatus: "Approved" })
    ]);

     // Prefer `skills`. If some old docs used `skillIds`, handle that too without model changes.
    const skillsArray = Array.isArray(jssDoc?.skills)
      ? jssDoc.skills
      : (Array.isArray(jssDoc?.skillIds) ? jssDoc.skillIds : []);

    // Normalize skill strings a bit (trim + dedupe) — harmless & robust
    const normalizedSkills = Array.from(
      new Set(
        (skillsArray || [])
          .filter(s => typeof s === "string")
          .map(s => s.trim())
          .filter(Boolean)
      )
    );

    const isEducationAdded  = eduCount  > 0;
    const isExperienceAdded = expCount  > 0;
     const isSkillsAdded     = normalizedSkills.length > 0;
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
         salaryType:   p.salaryType?.name   || null,  
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
        isExperienceAdded,

        // ✅ new fields
        myJobs: approvedJobsCount,   // number of approved applications
        myAttendance: 0
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
      message: "Job seeker profile image updated successfully.",
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
    const page  = parseInt(req.query.page, 10)  || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip  = (page - 1) * limit;

    const { city = "", jobProfile = "" } = req.query;

    // -------- base filter --------
    const filter = { isDeleted: false };

    // -------- city: case-insensitive exact --------
    if (city && city.trim()) {
      filter.city = { $regex: new RegExp(`^${escapeRegex(city.trim())}$`, "i") };
    }

    // -------- unified jobProfile filter (job profile name OR skills) --------
    if (jobProfile && jobProfile.trim()) {
      const terms = jobProfile
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

      if (terms.length) {
        const regexes = terms.map(t => new RegExp(`^${escapeRegex(t)}$`, "i"));
        const orClauses = [];

        // (A) JobProfile names -> JobProfile IDs -> filter by jobProfile
        const matchedProfiles = await JobProfile
          .find({ name: { $in: regexes } })
          .select("_id")
          .lean();
        if (matchedProfiles.length) {
          orClauses.push({ jobProfile: { $in: matchedProfiles.map(d => d._id) } });
        }

        // (B) Skill names -> JobSeekerSkill.userId -> filter by userId
        // JobSeekerSkill schema: { userId, skills: [String], isDeleted }
        const skillRows = await JobSeekerSkill
          .find({ isDeleted: false, skills: { $in: regexes } })
          .select("userId")
          .lean();

        const skillUserIds = [...new Set(skillRows.map(r => r.userId))];
        if (skillUserIds.length) {
          orClauses.push({ userId: { $in: skillUserIds } });
        }

        // If nothing matched any term, return empty page quickly
        if (!orClauses.length) {
          return res.json({
            status: true,
            message: "Job seekers profiles fetched successfully.",
            totalSeekers: 0,
            currentPage: page,
            totalPages: 0,
            data: []
          });
        }

        // Apply (jobProfile name OR has any skill)
        filter.$or = orClauses;
      }
    }

    // -------- count & fetch USING THE SAME FILTER --------
    const totalSeekers = await JobSeekerProfile.countDocuments(filter);

    const seekers = await JobSeekerProfile.find(filter)
      .select("userId phoneNumber name industryType jobProfile panCardNumber alternatePhoneNumber dateOfBirth email gender address state city pincode image CurrentSalary")
      .populate("industryType", "name")
      .populate("jobProfile",   "name")
      .populate("state",        "state")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    // Return empty page (200) if none
    if (!seekers.length) {
      return res.json({
        status: true,
        message: "Job seekers profiles fetched successfully.",
        totalSeekers,
        currentPage: page,
        totalPages: Math.ceil(totalSeekers / limit),
        data: []
      });
    }

    // -------- fetch skills for these seekers by userId (ONE query) --------
    const userIds = seekers.map(s => s.userId).filter(Boolean);
    const skillDocs = userIds.length
      ? await JobSeekerSkill.find({ isDeleted: false, userId: { $in: userIds } })
          .select("userId skills")
          .lean()
      : [];

    const skillsByUserId = new Map(
      skillDocs.map(d => [String(d.userId), Array.isArray(d.skills) ? d.skills.filter(Boolean) : []])
    );

    // -------- shape response (skills as [] if none) --------
    const data = seekers.map(seeker => ({
      id: seeker._id,
      userId: seeker.userId,
      phoneNumber: seeker.phoneNumber,
      jobSeekerName: seeker.name ?? null,
      industryType: seeker.industryType?.name ?? null,
      jobProfile:   seeker.jobProfile?.name   ?? null,
      panCardNumber: seeker.panCardNumber ?? null,
      alternatePhoneNumber: seeker.alternatePhoneNumber ?? null,
      dateOfBirth: seeker.dateOfBirth ? new Date(seeker.dateOfBirth).toISOString().split("T")[0] : null,
      email: seeker.email ?? null,
      gender: seeker.gender ?? null,
      address: seeker.address ?? null,
      state: seeker.state?.state ?? null,
      city: seeker.city ?? null,
      pincode: seeker.pincode ?? null,
      image: seeker.image ?? null,
      currentSalary: seeker.CurrentSalary ?? seeker.currentSalary ?? null,
      skills: skillsByUserId.get(String(seeker.userId)) ?? []   // ✅ always array
    }));

    return res.json({
      status: true,
      message: "Job seekers profiles fetched successfully.",
      totalSeekers,
      currentPage: page,
      totalPages: Math.ceil(totalSeekers / limit),
      data
    });
  } catch (error) {
    console.error("Error fetching job seekers:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};



//without token get job seeker details
exports.getSeekerDetails = async (req, res) => {
  try {
    const { jobSeekerId } = req.params || {};

    // ---- validate ----
    if (!jobSeekerId || !mongoose.isValidObjectId(jobSeekerId)) {
      return res.status(400).json({ status: false, message: "Valid jobSeekerId is required in params." });
    }

    // ---- seeker profile (must be active) ----
    const seeker = await JobSeekerProfile.findById(jobSeekerId)
      .select("name phoneNumber email state city image jobProfile dateOfBirth gender panCardNumber address alternatePhoneNumber pincode industryType isDeleted CurrentSalary currentSalary")
      .populate([
        { path: "state", select: "state" },
        { path: "jobProfile", select: "jobProfile name" },
        { path: "industryType", select: "industryType name" }
      ])
      .lean();

    if (!seeker) {
      return res.status(404).json({ status: false, message: "Job seeker not found." });
    }
    if (seeker.isDeleted) {
      return res.status(409).json({ status: false, message: "This job seeker profile is disabled." });
    }

    // ---- related sections ----
    const [educations, experiences, jsSkills, resumes] = await Promise.all([
      JobSeekerEducation.find({ jobSeekerId }).select({
        jobSeekerId: 1, _id: 0,
        degree: 1,
        boardOfUniversity: 1, boardofuniversity: 1,
        sessionFrom: 1, sessionfrom: 1,
        sessionTo: 1, sessionto: 1,
        marks: 1,
        gradeOrPercentage: 1, gradeorPercentage: 1
      }).lean(),

      WorkExperience.find({ jobSeekerId })
        .select("jobSeekerId companyName jobTitle sessionFrom sessionTo roleDescription -_id")
        .lean(),

      JobSeekerSkill.find({ jobSeekerId, isDeleted: false })
        .select("jobSeekerId skillIds -_id")
        .populate({ path: "skillIds", select: "skill", model: "Skill" }) // your Skill schema uses field "skill"
        .lean(),

      Resume.find({ jobSeekerId, isDeleted: { $ne: true } })
        .select("jobSeekerId fileName fileUrl -_id")
        .lean()
    ]);

    // ---- helpers ----
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    };

    const normalizeEdu = (e) => ({
      degree: e.degree ?? null,
      boardOfUniversity: e.boardOfUniversity ?? e.boardofuniversity ?? null,
      sessionFrom: formatDate(e.sessionFrom ?? e.sessionfrom),
      sessionTo: formatDate(e.sessionTo ?? e.sessionto),
      marks: e.marks ?? null,
      gradeOrPercentage: e.gradeOrPercentage ?? e.gradeorPercentage ?? null
    });

    const normalizeExp = (x) => ({
      companyName: x.companyName ?? null,
      jobTitle: x.jobTitle ?? null,
      sessionFrom: formatDate(x.sessionFrom),
      sessionTo: formatDate(x.sessionTo),
      roleDescription: x.roleDescription ?? null
    });

    // skills -> array of strings or null
    const skillNames = Array.from(
      new Set(
        (jsSkills || [])
          .flatMap(doc => (doc.skillIds || []))
          .map(s => (s && typeof s === "object" && "skill" in s) ? s.skill : null)
          .filter(Boolean)
      )
    );
    const skills = skillNames.length ? skillNames : null;

    const normalizedResumes = (resumes || []).map(r => ({
      fileName: r.fileName ?? null
     
    }));

    // ---- response ----
    const data = {
      jobSeekerId: jobSeekerId.toString(),
      jobSeekerName: seeker.name ?? null,
      email: seeker.email ?? null,
      phoneNumber: seeker.phoneNumber ?? null,
      alternatePhoneNumber: seeker.alternatePhoneNumber ?? null,
      image: seeker.image ?? null,
      dateOfBirth: formatDate(seeker.dateOfBirth),
      gender: seeker.gender ?? null,
      panCardNumber: seeker.panCardNumber ?? null,          // consider removing from public if needed
      address: seeker.address ?? null,
      pincode: seeker.pincode ?? null,
      state: seeker.state?.state ?? null,
      city: seeker.city ?? null,
      jobProfile: seeker.jobProfile ? (seeker.jobProfile.jobProfile || seeker.jobProfile.name || null) : null,
      industryType: seeker.industryType ? (seeker.industryType.industryType || seeker.industryType.name || null) : null,
      currentSalary: seeker.CurrentSalary ?? seeker.currentSalary ?? null,
      educations: (educations || []).map(normalizeEdu),
      experiences: (experiences || []).map(normalizeExp),
      skills,
      resumes: normalizedResumes
    };

    return res.status(200).json({
      status: true,
      message: "Job seeker details fetched successfully.",
      data
    });
  } catch (err) {
    console.error("getPublicJobSeekerDetails error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
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
        adminRecommendedSeeker alternatePhoneNumber panCardNumber address pincode adminTopProfiles
      `)
      .populate("industryType", "name")
      .populate("jobProfile", "name title label")
      .populate("state", "state name") // supports either field in your StateCity model
      .lean();

    // shape payload
    const jobSeekers = profiles.map(p => ({
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
      adminTopProfiles: !!p.adminTopProfiles,
     

      // expose contact if your product rules allow it:
      email: p.email ?? null,
      phoneNumber: p.phoneNumber ?? null
    }));

    return res.status(200).json({
      status: true,
      message: "Recommended job seeker profiles fetched successfully.",
    data: {
        totalRecord,
      totalPage,
      currentPage: page,
      jobSeekers
    }
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
        message: "Only employers can access top job seeker profiles."
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
        adminRecommendedSeeker alternatePhoneNumber panCardNumber address pincode adminTopProfiles
      `)
      .populate("industryType", "name")
      .populate("jobProfile", "name title label")
      .populate("state", "state name") // supports either field in your StateCity model
      .lean();

    // shape payload
    const jobSeekers = profiles.map(p => ({
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
       adminTopProfiles: !!p.adminTopProfiles,
     

      // expose contact if your product rules allow it:
      email: p.email ?? null,
      phoneNumber: p.phoneNumber ?? null
    }));

    return res.status(200).json({
      status: true,
      message: "Top job seeker profiles fetched successfully.",
     data: { 
      totalRecord,
      totalPage,
      currentPage: page,
      jobSeekers
     }
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
    const { userId, role } = req.user; // from verifyToken

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Only job seekers can view profile progress.",
      });
    }

    const profile = await JobSeekerProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ status: false, message: "Profile not found." });
    }

    if (profile.isDeleted) {
      return res.status(409).json({
        status: false,
        message: "Your profile is currently disabled.",
      });
    }

    const isPresent = (v) => {
      if (v === null || v === undefined) return false;
      if (typeof v === "string") return v.trim().length > 0;
      if (Array.isArray(v)) return v.length > 0;
      return true;
    };

    const basicFieldsList = [
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
    const basicFields = basicFieldsList.every((f) => isPresent(profile[f]));

    // 👇 compute from DB instead of the flag
    const hasExp = await WorkExperience.exists({ userId, isDeleted: { $ne: true } });
    const workExperience = !!hasExp;


    // in getProfileProgress
const hasEdu = await JobSeekerEducation.exists({ userId, isDeleted: { $ne: true } });
const education = !!hasEdu;

 // in getProfileProgress
  const hasSkills = await JobSeekerSkill.exists({
      userId,
      isDeleted: { $ne: true },
      "skills.0": { $exists: true }, // ← ensures at least one skill in array
    });
    const skills = !!hasSkills;

    // in getProfileProgress
  const hasResume = await Resume.exists({ userId, isDeleted: { $ne: true } });
const resume = !!hasResume;

    let completed = 0;
    if (basicFields) completed++;
    if (workExperience) completed++;
    if (education) completed++;
    if (skills) completed++;
    if (resume) completed++;

    const progress = Math.min(100, Math.max(0, Math.round((completed / 5) * 100)));

    return res.status(200).json({
      status: true,
      message: "Profile progress fetched successfully.",
      progress,         // number 0..100
      basicFields,      // boolean
      workExperience,   // boolean
      education,        // boolean
      skills,           // boolean
      resume            // boolean
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};


//get job seeker employerApprovalStatus=approved job applications
exports.getMyApprovedApplications = async (req, res) => {
  try {
    const { role, userId } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view their approved applications.",
      });
    }

    // ---- pagination ----
    const pageParam = parseInt(req.query.page, 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

    const limitRaw = (req.query.limit || "").toString().toLowerCase();
    const limit =
      limitRaw === "all"
        ? 0
        : (() => {
            const n = parseInt(limitRaw || "10", 10);
            if (!Number.isFinite(n) || n < 1) return 10;
            return Math.min(n, 100);
          })();
    const skip = limit ? (page - 1) * limit : 0;

    // ---- base filter: this user's apps with employer approval === Approved ----
    const baseFilter = { userId, employerApprovalStatus: "Approved" };

    const totalRecord = await JobApplication.countDocuments(baseFilter);

    const apps = await JobApplication.find(baseFilter)
      .select("jobPostId status employerApprovalStatus appliedAt createdAt")
      .sort({ appliedAt: -1 })
      .skip(skip)
      .limit(limit || 0)
      .populate({
        path: "jobPostId",
        select:
          "jobTitle companyId state city minSalary maxSalary jobType salaryType experience workingShift jobProfile",
        populate: [
          { path: "companyId",     model: CompanyProfile,  select: "companyName image" },
          { path: "state",         model: StateCity,       select: "state" },
          { path: "jobType",       model: JobType,         select: "name" },
          { path: "salaryType",    model: SalaryType,      select: "name" },
          { path: "experience",    model: ExperienceRange, select: "name" },
          { path: "workingShift",  model: WorkingShift,    select: "name" },
          { path: "jobProfile",    model: JobProfile,      select: "name jobProfile" },
        ],
      })
      .lean();


       // ---------- TASK STATS (no aggregation) ----------
    const appIds = apps.map(a => a._id);

    // pre-seed with zeros so every app has stats
    const statsByAppId = new Map(
      apps.map(a => [String(a._id), { totalTask: 0, totalTaskApproved: 0, taskHours: 0 }])
    );

    if (appIds.length) {
      const tasks = await Task.find({ jobApplicationId: { $in: appIds } })
        .select("jobApplicationId workedHours hoursWorked employerApprovedTask")
        .lean();

      for (const t of tasks) {
        const key = String(t.jobApplicationId);
        const stats = statsByAppId.get(key);
        if (!stats) continue;

        // every task counts toward total
        stats.totalTask += 1;

        // only approved tasks affect approved count + hours
        if (t.employerApprovedTask === "Approved") {
          stats.totalTaskApproved += 1;

          // prefer workedHours if > 0, else hoursWorked
          const hours =
            (typeof t.workedHours === "number" && t.workedHours > 0)
              ? t.workedHours
              : (typeof t.hoursWorked === "number" ? t.hoursWorked : 0);

          stats.taskHours += Number(hours) || 0;
        }
      }

      // round hours to 2 decimals
      for (const s of statsByAppId.values()) {
        s.taskHours = Math.round(s.taskHours * 100) / 100;
      }
    }
    // -------------------------------------------------

    const data = apps.map(a => {
      const jp = a.jobPostId || {};
      const co = jp.companyId || {};
      const st = jp.state || {};
      const jobType  = jp.jobType?.name || null;
      const salaryType = jp.salaryType?.name || null;
      const experience = jp.experience?.name || null;
      const workingShift = jp.workingShift?.name || null;
      const jobProfile =
        jp.jobProfile?.jobProfile || jp.jobProfile?.name || null;


          const k = String(a._id);
      const stats = statsByAppId.get(k) || { totalTask: 0, totalTaskApproved: 0, taskHours: 0 };


      return {
        applicationId: String(a._id),
        jobPostId:     jp?._id ? String(jp._id) : null,    // keep if you need it; remove if not
        jobTitle:      jp.jobTitle || null,
        companyName:   co.companyName || null,
        companyImage:  co.image || null,
        state:         st.state || null,
        city:          jp.city || null,

        minSalary:     jp.minSalary ?? null,
        maxSalary:     jp.maxSalary ?? null,
        salaryType,
        jobType,
        experience,
        workingShift,
        jobProfile,

//task stats
  totalTask:         stats.totalTask,
        totalTaskApproved: stats.totalTaskApproved,
        taskHours:         stats.taskHours,
        

        status: a.status,                                  // e.g., "Applied"
        employerApprovalStatus: a.employerApprovalStatus,  // "Approved"
        appliedDate: a.appliedAt ? formatDDMMYYYY(a.appliedAt) : null,
      };
    });

    const totalPage = limit && totalRecord > 0 ? Math.ceil(totalRecord / limit) : 1;
    const currentPage = limit ? Math.min(page, totalPage || 1) : 1;

    return res.status(200).json({
      status: true,
      message: "Approved applications fetched successfully.",
      totalRecord,
      totalPage,
      currentPage,
      data,
    });
  } catch (err) {
    console.error("getMyApprovedApplications error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message,
    });
  }
};



//through industry id in response i am getting job seeker list
exports.getJobSeekersByIndustry = async (req, res) => {
  try {
    const { industryId } = req.params;

    // ---- validate industry id ----
    if (!mongoose.isValidObjectId(industryId)) {
      return res.status(400).json({ status: false, message: "Invalid industryId." });
    }

    // ---- ensure industry exists & not deleted ----
    const industry = await IndustryType.findOne({ _id: industryId, isDeleted: false })
      .select("_id name")
      .lean();
    if (!industry) {
      return res.status(404).json({ status: false, message: "Industry not found." });
    }

    // ---- pagination ----
    const pageParam = parseInt(req.query.page, 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

    const limitRaw = (req.query.limit || "").toString().toLowerCase();
    const limit =
      limitRaw === "all"
        ? 0
        : (() => {
            const n = parseInt(limitRaw || "10", 10);
            if (!Number.isFinite(n) || n < 1) return 10;
            return Math.min(n, 100);
          })();
    const skip = limit ? (page - 1) * limit : 0;

    // ---- query params ----
    const { city = "", jobProfile = "" } = req.query;

    // ---- base filter ----
    const filter = {
      industryType: industry._id,
      isDeleted: false,
    };

    // ---- city filter: case-insensitive exact ----
    if (city && city.trim()) {
      filter.city = { $regex: new RegExp(`^${escapeRegex(city.trim())}$`, "i") };
    }

    // ---- unified jobProfile filter: job profile name(s) OR skill name(s) ----
    if (jobProfile && jobProfile.trim()) {
      const terms = jobProfile
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

      if (terms.length) {
        const regexes = terms.map(t => new RegExp(`^${escapeRegex(t)}$`, "i"));
        const orClauses = [];

        // (A) JobProfile name(s) -> IDs
        const matchedProfiles = await JobProfile
          .find({ name: { $in: regexes } })
          .select("_id")
          .lean();
        const jobProfileIds = matchedProfiles.map(d => d._id);
        if (jobProfileIds.length) {
          orClauses.push({ jobProfile: { $in: jobProfileIds } });
        }

        // (B) Skill name(s) -> JobSeekerSkill.userId -> JobSeekerProfile._id
        const skillDocs = await JobSeekerSkill
          .find({ isDeleted: false, skills: { $in: regexes } })
          .select("userId")
          .lean();
        const userIdSet = new Set(skillDocs.map(d => String(d.userId)));

        if (userIdSet.size) {
          const profiles = await JobSeekerProfile
            .find({ isDeleted: false, userId: { $in: Array.from(userIdSet) } })
            .select("_id")
            .lean();
          const profileIds = profiles.map(p => p._id);
          if (profileIds.length) {
            orClauses.push({ _id: { $in: profileIds } });
          }
        }

        if (!orClauses.length) {
          return res.status(200).json({
            status: true,
            message: "Job seekers fetched successfully.",
            totalRecord: 0,
            totalPage: 0,
            currentPage: 1,
            data: []
          });
        }

        filter.$or = orClauses; // apply unified profile/skills OR filter
      }
    }

    // ---- count & fetch USING THE SAME FILTER ----
    const totalRecord = await JobSeekerProfile.countDocuments(filter);

    const seekers = await JobSeekerProfile.find(filter)
      .select("userId name image phoneNumber email state city jobProfile isExperienced") // include userId ✅
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit || 0)
      .populate({ path: "jobProfile", model: JobProfile, select: "name jobProfile" })
      .populate({ path: "state", model: StateCity, select: "state" })
      .lean();

    // ---- fetch skills for these seekers by userId (ONE query) ----
    const userIds = seekers.map(s => s.userId).filter(Boolean);
    const skillRows = userIds.length
      ? await JobSeekerSkill.find({ isDeleted: false, userId: { $in: userIds } })
          .select("userId skills")
          .lean()
      : [];

    const skillsByUserId = new Map(
      skillRows.map(r => [String(r.userId), Array.isArray(r.skills) ? r.skills.filter(Boolean) : []])
    );

    // ---- shape response (include skills) ----
    const data = seekers.map((p) => ({
      jobSeekerId: String(p._id),
      name: p.name || null,
      image: p.image || null,
      phoneNumber: p.phoneNumber || null,
      email: p.email || null,
      state: p.state?.state || null,
      city: p.city || null,
      jobProfile: p.jobProfile ? (p.jobProfile.jobProfile || p.jobProfile.name || null) : null,
      industryTypeId: String(industry._id),
      industryTypeName: industry.name || null,
      isExperienced: !!p.isExperienced,
      skills: skillsByUserId.get(String(p.userId)) || []  // ✅ skills from JobSeekerSkill
    }));

    const totalPage = limit && totalRecord > 0 ? Math.ceil(totalRecord / limit) : 1;
    const currentPage = limit ? Math.min(page, totalPage || 1) : 1;

    return res.status(200).json({
      status: true,
      message: "Job seekers fetched successfully.",
      totalRecord,
      totalPage,
      currentPage,
      data,
    });
  } catch (err) {
    console.error("getJobSeekersByIndustry error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message,
    });
  }
};










//dashboard of job seeker (mobile)
exports.getJobSeekerDashboard = async (req, res) => {
  try {
    const { role, userId } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view this dashboard.",
      });
    }

    // Aggregate approved tasks for this job seeker
    const pipeline = [
      { $match: { employerApprovedTask: "Approved" } },

      // Join -> JobApplication (to find tasks belonging to this seeker)
      {
        $lookup: {
          from: "jobapplications",
          let: { jaId: "$jobApplicationId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$jaId"] } } },
            { $project: { _id: 1, userId: 1, jobPostId: 1 } },
          ],
          as: "jobApp",
        },
      },
      { $unwind: "$jobApp" },
      { $match: { "jobApp.userId": new mongoose.Types.ObjectId(userId) } },

      // Join -> JobPost (to get hourlyRate)
      {
        $lookup: {
          from: "jobposts",
          localField: "jobApp.jobPostId",
          foreignField: "_id",
          as: "jobPost",
        },
      },
      { $unwind: "$jobPost" },

      // Compute earning per task
      {
        $addFields: {
          earning: {
            $multiply: [
              { $ifNull: ["$workedHours", 0] },
              { $ifNull: ["$jobPost.hourlyRate", 0] },
            ],
          },
        },
      },

      // Totals
      {
        $group: {
          _id: null,
          totalHours: { $sum: { $ifNull: ["$workedHours", 0] } },
          totalEarnings: { $sum: "$earning" },
          completedJobs: { $sum: 1 }, // or use $addToSet of jobPostId if you want distinct jobs
        },
      },
    ];

    const agg = await Task.aggregate(pipeline);
    const totals = agg[0] || { totalHours: 0, totalEarnings: 0, completedJobs: 0 };

    // round to 2 decimals, send as strings (no units)
    const round2 = (n) => (Math.round((n || 0) * 100) / 100).toString();

    const dashBoard = [
      { id: "hoursWorked",   label: "Hours worked",   value: round2(totals.totalHours),   icon: "timer" },
      { id: "totalEarnings", label: "Total Earnings", value: round2(totals.totalEarnings), icon: "rupee" },
      { id: "completedJobs", label: "Completed jobs", value: "0",                         icon: "briefcase" },
    ];

    return res.status(200).json({
      status: true,
      message: "Dashboard data fetched successfully",
      data: { dashBoard },
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err?.message || "Server error." });
  }
};


//dashboard of job seeker (website)
exports.getSeekerDashboardWeb = async (req, res) => {
  try {
    const { role, userId } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view this dashboard.",
      });
    }

    const pipeline = [
      { $match: { employerApprovedTask: "Approved" } },

      // Link to the job application, then filter for this seeker
      {
        $lookup: {
          from: "jobapplications",
          let: { jaId: "$jobApplicationId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$jaId"] } } },
            { $project: { _id: 1, userId: 1, jobPostId: 1 } },
          ],
          as: "jobApp",
        },
      },
      { $unwind: "$jobApp" },
      { $match: { "jobApp.userId": new mongoose.Types.ObjectId(userId) } },

      // Get hourlyRate from job post
      {
        $lookup: {
          from: "jobposts",
          localField: "jobApp.jobPostId",
          foreignField: "_id",
          as: "jobPost",
        },
      },
      { $unwind: "$jobPost" },

      // earning = workedHours * hourlyRate
      {
        $addFields: {
          earning: {
            $multiply: [
              { $ifNull: ["$workedHours", 0] },
              { $ifNull: ["$jobPost.hourlyRate", 0] },
            ],
          },
        },
      },

      // Totals for this seeker
      {
        $group: {
          _id: null,
          totalHours: { $sum: { $ifNull: ["$workedHours", 0] } },
          totalEarnings: { $sum: "$earning" },
          completedJobs: { $sum: 1 }, // change to {$addToSet: "$jobApp.jobPostId"} & use {$size:"$completedJobs"} if you want distinct jobs
        },
      },
    ];

    const agg = await Task.aggregate(pipeline);
    const totals = agg[0] || { totalHours: 0, totalEarnings: 0, completedJobs: 0 };

    const round2 = (n) => Math.round((n || 0) * 100) / 100;

    return res.status(200).json({
      status: true,
      message: "Dashboard data fetched successfully",
      data: {
        hoursWorked: round2(totals.totalHours),
        totalEarnings: round2(totals.totalEarnings),
        completedJobs: 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err?.message || "Server error." });
  }
};







//top 5 industry types and its job seeker list in array format without token
function daysAgo(dt) {
  if (!dt) return null;
  const diff = Math.max(0, Date.now() - new Date(dt).getTime());
  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (d === 0) return "today";
  if (d === 1) return "1 day ago";
  return `${d} days ago`;
}


exports.getTopIndustryTypes = async (req, res) => {
  try {
    const industryLimit = Math.max(
      parseInt(req.query.industryLimit, 10) ||
      parseInt(req.query.categoryLimit, 10) || 5,
      1
    );

    const profilesPerIndustry = Math.max(
      parseInt(req.query.profilesPerIndustry, 10) ||
      parseInt(req.query.postsPerCategory, 10) || 6,
      1
    );

    // Resolve actual collection names (safer for aggregation)
    const COL = {
      seekers:         JobSeekerProfile.collection.name,
      industryTypes:   IndustryType.collection.name,
      jobProfiles:     JobProfile.collection.name,
      states:          StateCity.collection.name,
      jobSeekerSkills: JobSeekerSkill.collection.name,
      skills:          Skill.collection.name,
    };

    const pipeline = [
      // 1) top industries by number of seekers
      { $match: { isDeleted: false, industryType: { $type: "objectId" } } },
      { $group: { _id: "$industryType", seekerCount: { $sum: 1 } } },
      { $sort: { seekerCount: -1 } },
      { $limit: industryLimit },

      // 2) attach industry doc
      {
        $lookup: {
          from: COL.industryTypes,
          let: { indId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$indId"] },
                    { $eq: ["$isDeleted", false] }
                  ]
                }
              }
            },
            { $project: { _id: 1, name: 1 } }
          ],
          as: "ind"
        }
      },
      { $unwind: "$ind" },

      // 3) latest N seekers per industry
      {
        $lookup: {
          from: COL.seekers,
          let: { indId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$industryType", "$$indId"] },
                    { $eq: ["$isDeleted", false] }
                  ]
                }
              }
            },
            { $sort: { createdAt: -1 } },
            { $limit: profilesPerIndustry },

            // display name lookups
            { $lookup: { from: COL.jobProfiles, localField: "jobProfile", foreignField: "_id", as: "jp" } },
            { $lookup: { from: COL.states,      localField: "state",      foreignField: "_id", as: "st" } },

            // skills: get jobSeekerSkills doc -> skillIds -> skills (names)
            {
              $lookup: {
                from: COL.jobSeekerSkills,
                let: { seekerId: "$_id" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$jobSeekerId", "$$seekerId"] },
                          { $eq: ["$isDeleted", false] }
                        ]
                      }
                    }
                  },
                  { $project: { _id: 0, skillIds: 1 } }
                ],
                as: "jss"
              }
            },
            {
              $addFields: {
                skillIds: { $ifNull: [{ $first: "$jss.skillIds" }, []] }
              }
            },
            { $lookup: { from: COL.skills, localField: "skillIds", foreignField: "_id", as: "skillDocs" } },
            {
              $addFields: {
                // Robustly pick the name from possible fields and drop nulls
                skills: {
                  $filter: {
                    input: {
                      $map: {
                        input: "$skillDocs",
                        as: "s",
                        in: {
                          $ifNull: [
                            "$$s.name",
                            { $ifNull: ["$$s.skillName", { $ifNull: ["$$s.skill", null] }] }
                          ]
                        }
                      }
                    },
                    as: "n",
                    cond: { $ne: ["$$n", null] }
                  }
                },
                jobProfile: { $first: "$jp.name" },
                state:      { $first: "$st.state" }
              }
            },

            // final seeker shape
            {
              $project: {
                _id: 1,
                name: 1,
                image: 1,
                gender: 1,
                jobProfile: 1,
                state: 1,
                city: 1,
                isExperienced: 1,
                adminRecommendedSeeker: 1,
                adminTopProfiles: 1,
                createdAt: 1,
                skills: 1
              }
            }
          ],
          as: "seekers"
        }
      },

      // 4) final per-industry
      {
        $project: {
          _id: 0,
          industryTypeId: "$ind._id",
          industryTypeName: "$ind.name",
          seekers: "$seekers"
        }
      }
    ];

    const rows = await JobSeekerProfile.aggregate(pipeline);

    // add "x days ago" + rename array to jobSeekers
    const data = rows.map(row => ({
      industryTypeId: row.industryTypeId,
      industryTypeName: row.industryTypeName,
      jobSeekers: (row.seekers || []).map(s => ({
        ...s,
        profileCreated: daysAgo(s.createdAt)
      }))
    }));

    return res.status(200).json({
      status: true,
      message: "Top industry types fetched successfully.",
      data
    });
  } catch (err) {
    console.error("getTopIndustryTypes error:", err);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch top industry types.",
      error: err.message
    });
  }
};

