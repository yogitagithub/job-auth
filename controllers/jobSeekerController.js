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

const createNotification = require("../config/createNotification");

const SalaryType       = require("../models/AdminSalaryType");
const JobType          = require("../models/AdminJobType");
const ExperienceRange  = require("../models/AdminExperienceRange");
const WorkingShift     = require("../models/AdminWorkingShift");
const Payment = require("../models/payment");


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

    // Fetch existing profile
    let profile = await JobSeekerProfile.findOne({ userId });

    if (profile && profile.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This job seeker profile is already deleted and cannot be updated."
      });
    }

    /* ---------------- INDUSTRY TYPE ---------------- */
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
          message: "Invalid industry type."
        });
      }

      req.body.industryType = industryDoc._id;

      if (industryDoc.name.toLowerCase() === "other") {
        const otherName = String(req.body.otherIndustryName || "").trim();
        if (!otherName) {
          return res.status(400).json({
            status: false,
            message: "otherIndustryName is required when industryType is Other."
          });
        }
        req.body.otherIndustryName = otherName;
      } else {
        req.body.otherIndustryName = null;
      }
    }

    /* ---------------- JOB PROFILE ---------------- */
    if (Object.prototype.hasOwnProperty.call(req.body, "jobProfile")) {
      const jp = String(req.body.jobProfile || "").trim();
      req.body.jobProfile = jp || null;
    }

    /* ---------------- DATE OF BIRTH ---------------- */
    if (Object.prototype.hasOwnProperty.call(req.body, "dateOfBirth")) {
      const raw = String(req.body.dateOfBirth).trim();
      let parsed = null;

      if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
        const [dd, mm, yyyy] = raw.split("-");
        parsed = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        parsed = new Date(`${raw}T00:00:00.000Z`);
      }

      if (!parsed || isNaN(parsed.getTime())) {
        return res.status(400).json({
          status: false,
          message: "Invalid dateOfBirth format."
        });
      }

      req.body.dateOfBirth = parsed;
    }

  /* ---------------- STATE & CITY (STRING → ObjectId) ---------------- */
if (req.body.state || req.body.city) {
  let stateDoc = null;

  // CASE 1: state is string (e.g. "Tamil Nadu")
  if (typeof req.body.state === "string" && !mongoose.Types.ObjectId.isValid(req.body.state)) {
    stateDoc = await StateCity.findOne({
      state: new RegExp(`^${req.body.state.trim()}$`, "i")
    });

    if (!stateDoc) {
      return res.status(400).json({
        status: false,
        message: "Invalid state name."
      });
    }

    req.body.state = stateDoc._id;
  }

  // CASE 2: state already ObjectId
  if (req.body.state && mongoose.Types.ObjectId.isValid(req.body.state)) {
    stateDoc = await StateCity.findById(req.body.state);

    if (!stateDoc) {
      return res.status(400).json({
        status: false,
        message: "State not found."
      });
    }
  }

  // CASE 3: validate city belongs to state
  if (req.body.city && stateDoc) {
    const cityInput = String(req.body.city).trim();

    const validCity = stateDoc.cities.find(
      c => c.toLowerCase() === cityInput.toLowerCase()
    );

    if (!validCity) {
      return res.status(400).json({
        status: false,
        message: "City does not belong to the selected state."
      });
    }

    req.body.city = validCity; // normalize case
  }

  // CASE 4: city provided but state missing → auto-detect
  if (!req.body.state && req.body.city) {
    const cityInput = String(req.body.city).trim();

    const autoState = await StateCity.findOne({
      cities: { $regex: new RegExp(`^${cityInput}$`, "i") }
    });

    if (!autoState) {
      return res.status(400).json({
        status: false,
        message: "Invalid city. No matching state found."
      });
    }

    req.body.state = autoState._id;
    req.body.city = autoState.cities.find(
      c => c.toLowerCase() === cityInput.toLowerCase()
    );
  }
}

    /* ---------------- EXPERIENCE & SALARY RULES ---------------- */
    const hasIsExperienced = Object.prototype.hasOwnProperty.call(req.body, "isExperienced");
    const hasSalary = Object.prototype.hasOwnProperty.call(req.body, "CurrentSalary");
    const hasSalaryType = Object.prototype.hasOwnProperty.call(req.body, "salaryType");

    if (hasIsExperienced) {
      req.body.isExperienced =
        ["true", "1", "yes"].includes(String(req.body.isExperienced).toLowerCase());
    }

    const nextIsExperienced =
      hasIsExperienced ? req.body.isExperienced : profile?.isExperienced ?? false;

    /* ---------- FRESHER (SAVE NULLS) ---------- */
    if (nextIsExperienced === false) {
      req.body.CurrentSalary = null;
      req.body.salaryType = null;
    }

    /* ---------- EXPERIENCED (STRICT) ---------- */
    if (nextIsExperienced === true) {
      if (!hasSalary && !profile?.CurrentSalary) {
        return res.status(400).json({
          status: false,
          message: "CurrentSalary is required for experienced candidates."
        });
      }

      if (!hasSalaryType && !profile?.salaryType) {
        return res.status(400).json({
          status: false,
          message: "salaryType is required for experienced candidates."
        });
      }

      if (hasSalary) {
        const n = Number(req.body.CurrentSalary);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({
            status: false,
            message: "CurrentSalary must be a non-negative number."
          });
        }
        req.body.CurrentSalary = n;
      }
    }

    /* ---------------- SALARY TYPE LOOKUP ---------------- */
    if (
      Object.prototype.hasOwnProperty.call(req.body, "salaryType") &&
      req.body.salaryType !== null
    ) {
      const raw = String(req.body.salaryType).trim();
      let salaryDoc = null;

      if (mongoose.Types.ObjectId.isValid(raw)) {
        salaryDoc = await SalaryType.findById(raw);
      }

      if (!salaryDoc) {
        salaryDoc = await SalaryType.findOne({
          name: new RegExp(`^${raw}$`, "i")
        });
      }

      if (!salaryDoc) {
        return res.status(400).json({
          status: false,
          message: "Invalid salary type."
        });
      }

      req.body.salaryType = salaryDoc._id;
    }

    /* ---------------- CREATE / UPDATE ---------------- */
    const restrictedFields = [
      "_id", "userId", "phoneNumber", "__v", "image",
      "isDeleted", "deletedAt"
    ];

    if (!profile) {
      profile = new JobSeekerProfile({
        userId,
        phoneNumber,
        ...req.body
      });
    } else {
      Object.keys(req.body).forEach(key => {
        if (!restrictedFields.includes(key)) {
          profile[key] = req.body[key];
        }
      });
    }

    await profile.save();

    /* ---------------- RESPONSE ---------------- */
    const populated = await JobSeekerProfile.findById(profile._id)
      .populate("industryType", "name")
      .populate("salaryType", "name")
      .populate("state", "state");

    const isExperienced = !!populated.isExperienced;

    return res.status(200).json({
      status: true,
      message: "Job seeker profile saved successfully.",
      data: {
        ...populated.toObject(),
        industryType: populated.industryType?.name || null,
        state: populated.state?.state || null,
        CurrentSalary: isExperienced ? populated.CurrentSalary ?? null : null,
        salaryType: isExperienced ? populated.salaryType?.name || null : null
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

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view their profiles."
      });
    }

    // fetch the profile (don't filter isDeleted so we can detect explicitly)
    const profile = await JobSeekerProfile.findOne({ userId })
      .populate("industryType", "name")
     
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
        message: "This profile has been deleted and cannot be viewed."
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

      const jobProfileName =
      (typeof p.jobProfile === "string" && p.jobProfile.trim()) ||
      (p.jobProfile && typeof p.jobProfile === "object" && (p.jobProfile.name || p.jobProfile.jobProfile)) ||
      null;

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

      
otherIndustryName:
  p.industryType?.name?.toLowerCase() === "other"
    ? p.otherIndustryName
    : null,


         jobProfile: jobProfileName,  
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
    const newImagePath = `${baseUrl}/api/uploads/images/${req.file.filename}`;
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
        message: "This profile is already deleted."
      });
    }

    // Soft delete
    profile.isDeleted = true;
    await profile.save();

    return res.status(200).json({
      status: true,
      message: "Job seeker profile deleted successfully."
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

    // The relaxed query criteria
    const query = {
        phoneNumber: { $exists: true, $ne: "" },
        image: { $exists: true, $ne: "" },
        industryType: { $exists: true, $ne: null },
        email: { $exists: true, $ne: "" },
        gender: { $exists: true, $ne: "" },
        dateOfBirth: { $exists: true, $ne: null },
        name: { $exists: true, $ne: "" },
        jobProfile: { $exists: true, $ne: "" },
        alternatePhoneNumber: { $exists: true, $ne: "" },
        pincode: { $exists: true, $ne: "" },
        city: { $exists: true, $ne: "" },
        isDeleted: false,
        isExperienced: { $exists: true },
    };
    
    // Count full profiles
    const totalRecord = await JobSeekerProfile.countDocuments(query);

    // Get paginated data with required population
    const seekers = await JobSeekerProfile.find(query)
      .populate("industryType", "name") 
      .populate("salaryType", "name")
      // ⚠️ IMPORTANT: Changed selector from "stateName" to "state" 
      // to match your StateCity schema.
      .populate("state", "state")     
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean(); 

    // --- Data Transformation: State Name and Conditional Industry Name ---

    const transformedSeekers = seekers.map(seeker => {
      // 1. Handle State Name: Extract 'state' field from the populated object
      // ⚠️ FIX APPLIED HERE: Changed .stateName to .state
      const stateName = seeker.state ? seeker.state.state : null; 
      
      // 2. Handle Industry Type: Use otherIndustryName if the primary type is "Other"
      let industryName;
      
      if (seeker.industryType && seeker.industryType.name.toLowerCase() === 'other' && seeker.otherIndustryName) {
        industryName = seeker.otherIndustryName;
      } else if (seeker.industryType) {
        industryName = seeker.industryType.name;
      } else {
        industryName = null;
      }


     // 3. Handle Salary Type: Extract 'type' field
      const salaryTypeName = seeker.salaryType ? seeker.salaryType.name : null;




      // Return the new object structure
      return {
        ...seeker,
        state: stateName,
        industryType: industryName,
       salaryType: salaryTypeName,
       CurrentSalary: seeker.CurrentSalary ? seeker.CurrentSalary : 0,
           };
    });

    // --- End Data Transformation ---

    return res.status(200).json({
      status: true,
      message: "Job seeker profiles fetched successfully.",
      totalRecord,
      totalPage: Math.ceil(totalRecord / limit),
      currentPage: page,
      data: transformedSeekers 
    });

  } catch (err) {
    console.error("Error fetching job seekers:", err);
    return res.status(500).json({
      status: false,
      message: "Server error. Please try again later.",
      error: err.message
    });
  }
};


exports.getSeekerDetails = async (req, res) => {
  try {
    const { jobSeekerId } = req.params || {};

    if (!jobSeekerId || !mongoose.isValidObjectId(jobSeekerId)) {
      return res.status(400).json({ status: false, message: "Valid jobSeekerId is required in params." });
    }

    // include userId so we can fetch skills by userId
    const seeker = await JobSeekerProfile.findById(jobSeekerId)
      .select("userId name phoneNumber email state city image jobProfile dateOfBirth gender panCardNumber address alternatePhoneNumber pincode industryType isDeleted CurrentSalary currentSalary")
      .populate([
        { path: "state", select: "state" },
      
        { path: "industryType", select: "industryType name" }
      ])
      .lean();

    if (!seeker) {
      return res.status(404).json({ status: false, message: "Job seeker not found." });
    }
    if (seeker.isDeleted) {
      return res.status(409).json({ status: false, message: "This job seeker profile is disabled." });
    }

      // include legacy docs w/o the flag, exclude when true
    const notDeleted = { $or: [{ isDeleted: { $exists: false } }, { isDeleted: false }] };
    const jsId = new mongoose.Types.ObjectId(jobSeekerId);


    const [educationsRaw, experiencesRaw, resumesRaw] = await Promise.all([
      JobSeekerEducation.find({ jobSeekerId })
        .select({
          jobSeekerId: 1, _id: 0,
          degree: 1,
          boardOfUniversity: 1, boardofuniversity: 1,
          sessionFrom: 1, sessionfrom: 1,
          sessionTo: 1, sessionto: 1,
          marks: 1,
          gradeOrPercentage: 1, gradeorPercentage: 1,
           isDeleted: 1
          
        })
        .lean(),

     
      WorkExperience.find({ jobSeekerId: jsId, ...notDeleted })
        .select("jobSeekerId companyName jobTitle sessionFrom sessionTo roleDescription isDeleted -_id")
        .lean(),

      Resume.find({ jobSeekerId: jsId, ...notDeleted })
        .select("jobSeekerId fileName fileUrl isDeleted -_id")
        .lean()
    ]);

  // ---------- SKILLS ----------
    let skills = [];
    if (seeker.userId) {
      const jss = await JobSeekerSkill
        .findOne({ userId: seeker.userId, ...notDeleted }) // doc-level soft delete
        .select("skills isDeleted")
        .lean();

      if (jss?.skills?.length) {
        // If you ever move to per-item soft delete in skills, add filtering here
        skills = Array.from(new Set(
          jss.skills
            .map(s => (typeof s === "string" ? s.trim() : "")) // your schema = [String]
            .filter(Boolean)
        ));
      }
    }


    // ---------- helpers ----------
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

   // Double-guard in memory as well (safety)
    const educations = (educationsRaw || [])
      .filter(e => e?.isDeleted !== true)
      .map(normalizeEdu);

    const experiences = (experiencesRaw || [])
      .filter(x => x?.isDeleted !== true)
      .map(normalizeExp);

    const resumes = Array.isArray(resumesRaw)
      ? resumesRaw.filter(r => r?.isDeleted !== true)
                 .map(r => ({ fileName: r.fileName ?? null, fileUrl: r.fileUrl ?? null }))
      : [];

    // --- response ---
    const data = {
      jobSeekerId: jobSeekerId.toString(),
      jobSeekerName: seeker.name ?? null,
      email: seeker.email ?? null,
      phoneNumber: seeker.phoneNumber ?? null,
      alternatePhoneNumber: seeker.alternatePhoneNumber ?? null,
      image: seeker.image ?? null,
      dateOfBirth: formatDate(seeker.dateOfBirth),
      gender: seeker.gender ?? null,
      panCardNumber: seeker.panCardNumber ?? null,
      address: seeker.address ?? null,
      pincode: seeker.pincode ?? null,
      state: seeker.state?.state ?? null,
      city: seeker.city ?? null,
     
     
     jobProfile: (() => {
  if (!seeker.jobProfile) return null;

  // current schema: String
  if (typeof seeker.jobProfile === "string") {
    return seeker.jobProfile;
  }

  // future-safe: if you ever change to ObjectId + populate
  return (
    seeker.jobProfile.jobProfile ||
    seeker.jobProfile.name ||
    null
  );
})(),



      industryType: seeker.industryType ? (seeker.industryType.industryType || seeker.industryType.name || null) : null,
      currentSalary: seeker.CurrentSalary ?? seeker.currentSalary ?? null,
      educations,     // always []
      experiences,    // always []
      skills,         // always []
      resumes         // always []
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
        message: "This job profile has been deleted and cannot be recommended."
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
  typeof jp.jobProfile === "string" ? jp.jobProfile : null;


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

    // 1️⃣ Get all job applications of seeker
    const applications = await JobApplication.find({ userId }).select("_id");

    if (applications.length === 0) {
      const dashBoard = [
        { id: "hoursWorked",   label: "Hours worked",   value: "0", icon: "timer" },
        { id: "totalEarnings", label: "Total Earnings", value: "0", icon: "rupee" },
        { id: "completedJobs", label: "Completed jobs", value: "0", icon: "briefcase" },
      ];

      return res.status(200).json({
        status: true,
        message: "Dashboard data fetched successfully",
        data: { dashBoard },
      });
    }

    const jobApplicationIds = applications.map(app => app._id);

    // 2️⃣ Approved tasks
    const approvedTasks = await Task.find({
      employerApprovedTask: "Approved",
      jobApplicationId: { $in: jobApplicationIds }
    });

    const CompletedJobs = approvedTasks.length;

    // 3️⃣ Calculate Hours Worked
    let HoursWorked = 0;

    approvedTasks.forEach(task => {
      if (task.hoursWorked && task.hoursWorked > 0) {
        HoursWorked += task.hoursWorked;
      } else if (task.startTime && task.endTime) {
        const diffMs = new Date(task.endTime) - new Date(task.startTime);
        HoursWorked += diffMs / (1000 * 60 * 60);
      }
    });

    // 4️⃣ Calculate Earnings
    const payments = await Payment.find({
      jobApplicationId: { $in: jobApplicationIds },
      isDeleted: false
    });

    let totalEarnings = 0;
    payments.forEach(payment => {
      totalEarnings += payment.totalAmount || 0;
    });

    // Round values
    const round2 = (n) => (Math.round((n || 0) * 100) / 100).toString();

    // 5️⃣ Build dashboard response EXACT FORMAT
    const dashBoard = [
      {
        id: "hoursWorked",
        label: "Hours worked",
        value: round2(HoursWorked),
        icon: "timer",
      },
      {
        id: "totalEarnings",
        label: "Total Earnings",
        value: round2(totalEarnings),
        icon: "rupee",
      },
      {
        id: "completedJobs",
        label: "Completed jobs",
        value: CompletedJobs.toString(),
        icon: "briefcase",
      }
    ];

    return res.status(200).json({
      status: true,
      message: "Dashboard data fetched successfully",
      data: { dashBoard },
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: err?.message || "Server error."
    });
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

    // 1️⃣ Get all job applications of seeker
    const applications = await JobApplication.find({ userId }).select("_id");

    if (applications.length === 0) {
      return res.status(200).json({
        status: true,
        message: "Dashboard data fetched successfully",
        data: {
          HoursWorked: 0,
          totalEarnings: 0,
          CompletedJobs: 0
        },
      });
    }

    const jobApplicationIds = applications.map(app => app._id);

    // 2️⃣ Get all approved tasks for this seeker
    const approvedTasks = await Task.find({
      employerApprovedTask: "Approved",
      jobApplicationId: { $in: jobApplicationIds }
    });

    const CompletedJobs = approvedTasks.length;

    // 3️⃣ Calculate Hours Worked
    let HoursWorked = 0;

    approvedTasks.forEach(task => {
      if (task.hoursWorked && task.hoursWorked > 0) {
        HoursWorked += task.hoursWorked;
      } else if (task.startTime && task.endTime) {
        const diffMs = new Date(task.endTime) - new Date(task.startTime);
        HoursWorked += diffMs / (1000 * 60 * 60);
      }
    });

    // 4️⃣ Calculate total earnings from payments
    const payments = await Payment.find({
      jobApplicationId: { $in: jobApplicationIds },
      isDeleted: false
    });

    let totalEarnings = 0;
    payments.forEach(payment => {
      totalEarnings += payment.totalAmount || 0;
    });

    return res.status(200).json({
      status: true,
      message: "Dashboard data fetched successfully",
      data: {
        HoursWorked,
        totalEarnings,
        CompletedJobs
      },
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: err?.message || "Server error."
    });
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


//job-seeker analytics
exports.getAnalytics = async (req, res) => {
  try {
    const userId = req.user.userId;  // job seeker ID

    // 1️⃣ Get all job applications made by this job seeker
    const applications = await JobApplication.find({ userId }).select("_id");

    if (applications.length === 0) {
      return res.status(200).json({
        status: true,
        message: "Analytics fetched successfully",
        data: {
          CompletedJobs: 0,
          HoursWorked: 0,
          totalEarnings: 0,
          jobCompletion: "0%",
        },
      });
    }

    const jobApplicationIds = applications.map(app => app._id);

    // 2️⃣ Get all APPROVED tasks for user’s job applications
    const approvedTasks = await Task.find({
      employerApprovedTask: "Approved",
      jobApplicationId: { $in: jobApplicationIds }
    });

    const CompletedJobs = approvedTasks.length;

    // 3️⃣ Total Hours Worked
    let HoursWorked = 0;

    approvedTasks.forEach(task => {
      if (task.hoursWorked && task.hoursWorked > 0) {
        HoursWorked += task.hoursWorked;
      } else if (task.startTime && task.endTime) {
        const diffMs = new Date(task.endTime) - new Date(task.startTime);
        HoursWorked += diffMs / (1000 * 60 * 60);
      }
    });

    // 4️⃣ Earnings from Payment Model
    const payments = await Payment.find({
      jobApplicationId: { $in: jobApplicationIds },
      isDeleted: false
    });

    let totalEarnings = 0;
    payments.forEach(payment => {
      totalEarnings += payment.totalAmount || 0;
    });

    // 5️⃣ Job Completion % (Paid Tasks / Completed Tasks)
    const paidTasks = approvedTasks.filter(t => t.isPaid);
    let jobCompletion = 0;

    if (CompletedJobs > 0) {
      jobCompletion = Math.round((paidTasks.length / CompletedJobs) * 100);
    }

    // 6️⃣ Response
    return res.status(200).json({
      status: true,
      message: "Analytics fetched successfully",
      data: {
        CompletedJobs,
       HoursWorked,
        totalEarnings,
        jobCompletion: `${jobCompletion}%`,
      },
    });

  } catch (error) {
    console.error("Analytics error:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch analytics",
      error: error.message,
    });
  }
};







