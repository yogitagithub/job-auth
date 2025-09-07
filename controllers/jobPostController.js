const JobPost = require("../models/JobPost");
const CompanyProfile = require("../models/CompanyProfile");
const IndustryType = require("../models/AdminIndustry");
const Category = require("../models/AdminCategory");
const StateCity = require("../models/StateCity");

const SalaryType = require("../models/AdminSalaryType");
const JobType = require("../models/AdminJobType");
const Experience = require("../models/AdminExperienceRange");     
const OtherField = require("../models/AdminOtherField");
const WorkingShift   = require("../models/AdminWorkingShift"); 
const JobProfile   = require("../models/AdminJobProfile"); 
 
const Skill = require("../models/Skills");

const mongoose = require("mongoose");

// Return "X day(s) ago)" — minutes/hours ignored
const daysAgo = (date) => {
  if (!date) return null;
  const d = new Date(date);
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()); // 00:00 of created day
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 00:00 today
  const diffDays = Math.max(0, Math.floor((startOfToday - startOfDate) / 86400000));
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
};


// helper: parse "YYYY-MM-DD" into a Date at UTC midnight
function parseDateOnlyToUTC(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!m) return null;
  const [_, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
}

// helper: format a Date as "YYYY-MM-DD" using its UTC parts
function formatDateOnlyUTC(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}


// Today's date at **UTC midnight**
function todayDateOnlyUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const escapeRegex = (str = "") =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

//correct
 exports.createJobPost = async (req, res) => {
  try {
    const userId = req.user.userId;

    // employer must have a company profile
    const company = await CompanyProfile.findOne({ userId });
    if (!company) {
      return res.status(400).json({
        status: false,
        message: "Company profile not found for this user. Please create a company profile first."
      });
    }

    
    const {
      category,
      industryType,
      salaryType,
      jobType,
      state,
       city,       
      experience,
      otherField,
workingShift,

jobProfile,
      jobTitle,
      jobDescription,
      skills,
      minSalary,
      maxSalary,
      displayPhoneNumber,
      displayEmail,
      hourlyRate,
      expiredDate
    } = req.body || {};

    // quick required checks
    const required = { category, industryType, salaryType, jobType, state, experience, otherField, workingShift, jobProfile };
    for (const [k, v] of Object.entries(required)) {
      if (!v || !String(v).trim()) {
        return res.status(400).json({ status: false, message: `${k} is required` });
      }
    }


     // skills must be a non-empty array
    if (!Array.isArray(skills) || skills.length === 0) {
      return res.status(400).json({ status: false, message: "skills must be a non-empty array." });
    }



    // simple validations
    if (minSalary != null && maxSalary != null && Number(minSalary) > Number(maxSalary)) {
      return res.status(400).json({ status: false, message: "minSalary cannot be greater than maxSalary." });
    }
    if (displayPhoneNumber && !/^[0-9]{8,15}$/.test(displayPhoneNumber)) {
      return res.status(400).json({ status: false, message: "Invalid displayPhoneNumber format." });
    }
    if (displayEmail && !/.+\@.+\..+/.test(displayEmail)) {
      return res.status(400).json({ status: false, message: "Invalid displayEmail format." });
    }

    // lookups by exact name (simple)
    const [
      categoryDoc,
      industryTypeDoc,
      salaryTypeDoc,
      jobTypeDoc,
      stateDoc,
      
      experienceDoc,
      otherFieldDoc,
      workingShiftDoc,
    
      jobProfileDoc
    ] = await Promise.all([

      Category.findOne({ name: category }),
      IndustryType.findOne({ name: industryType }),
      SalaryType.findOne({ name: salaryType, isDeleted: false }),
      JobType.findOne({ name: jobType, isDeleted: false }),
      
      StateCity.findOne({ state }),
      Experience.findOne({ name: experience, isDeleted: false }), 
      OtherField.findOne({ name: otherField, isDeleted: false }),
      WorkingShift.findOne({ name: workingShift, isDeleted: false }),
     
        JobProfile.findOne({ name: jobProfile, isDeleted: false })
    ]);

    if (!categoryDoc)     return res.status(400).json({ status: false, message: "Invalid category name." });
    if (!industryTypeDoc) return res.status(400).json({ status: false, message: "Invalid industry type name." });
    if (!salaryTypeDoc)   return res.status(400).json({ status: false, message: "Invalid or deleted salary type name." });
    if (!jobTypeDoc)      return res.status(400).json({ status: false, message: "Invalid or deleted job type name." });
   

    if (!stateDoc)        return res.status(400).json({ status: false, message: "Invalid state name." });
    if (!experienceDoc)   return res.status(400).json({ status: false, message: "Invalid or deleted experience name." });
    if (!otherFieldDoc)   return res.status(400).json({ status: false, message: "Invalid or deleted other field name." });
    if (!workingShiftDoc)   return res.status(400).json({ status: false, message: "Invalid or deleted working shift name." });
   if (!jobProfileDoc)   return res.status(400).json({ status: false, message: "Invalid or deleted job profile name." });


    // --- CITY VALIDATION (optional) ---
    let cityToSave;
    if (city && String(city).trim()) {
      const norm = String(city).trim().toLowerCase();
      const allowed = (stateDoc.cities || []).find(c => String(c).toLowerCase() === norm);
      if (!allowed) {
        return res.status(400).json({
          status: false,
          message: "Invalid city for selected state.",
          allowedCities: stateDoc.cities || []
        });
      }
      // Use canonical capitalization from DB
      cityToSave = allowed;
    }



    // ---------- skills: accept names and/or ObjectIds ----------
const input = Array.from(new Set(
  (Array.isArray(skills) ? skills : [])
    .map(s => (typeof s === 'string' ? s.trim() : s))
)).filter(Boolean);

const idInputs   = input.filter(v => mongoose.isValidObjectId(v));
const nameInputs = input.filter(v => !mongoose.isValidObjectId(v)).map(String);

// Build case-insensitive regexes for names
const nameRegexes = nameInputs.map(n => new RegExp(`^${escapeRegex(n)}$`, 'i'));

const [skillDocsById, skillDocsByName] = await Promise.all([
  idInputs.length
    ? Skill.find({ _id: { $in: idInputs }, isDeleted: false })
    : [],
  nameInputs.length
    ? Skill.find({ skill: { $in: nameRegexes }, isDeleted: false })
    : []
]);

const allSkillDocs = [...skillDocsById, ...skillDocsByName];

// For “missing” list, check both ids and names (case-insensitive compare to doc.skill)
const foundIds = new Set(allSkillDocs.map(d => String(d._id)));
const missing = [];
for (const v of input) {
  if (mongoose.isValidObjectId(v)) {
    if (!foundIds.has(String(v))) missing.push(v);
  } else {
    const matched = allSkillDocs.find(d => String(d.skill).toLowerCase() === String(v).toLowerCase());
    if (!matched) missing.push(v);
  }
}
if (missing.length) {
  return res.status(400).json({
    status: false,
    message: "Some skills were not found or are deleted.",
    missing
  });
}

const skillsIds   = allSkillDocs.map(d => d._id);
const skillsNames = allSkillDocs.map(d => d.skill);


// expiry (+30 days default)
    let expiry = expiredDate ? new Date(expiredDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (isNaN(expiry.getTime())) {
      return res.status(400).json({ status: false, message: "Invalid expiredDate." });
    }

    // create job (save ObjectIds)
    const jobPost = await JobPost.create({
      userId,
      companyId: company._id,
      category: categoryDoc._id,
      industryType: industryTypeDoc._id,
      salaryType: salaryTypeDoc._id,
      jobType: jobTypeDoc._id,
       skills: skillsIds,   
      state: stateDoc._id,
      city: cityToSave,
      experience: experienceDoc._id,
      otherField: otherFieldDoc._id,
      workingShift: workingShiftDoc._id,
    
       jobProfile: jobProfileDoc._id,


      jobTitle,
      jobDescription,
     
      minSalary,
      maxSalary,
      displayPhoneNumber,
      displayEmail,
      hourlyRate,
      expiredDate: expiry,
      status: "active",

        isAdminApproved: false,
      isActive: false,
      isLatest: false,
      isSaved: false
    });

    const formattedExpiredDate = jobPost.expiredDate.toISOString().split("T")[0];

    return res.status(201).json({
      status: true,
      message: "Job post created successfully.",
      data: {
        _id: jobPost._id,
        userId: jobPost.userId,
        companyId: jobPost.companyId,

        // return friendly names (you sent names; ids saved internally)
        category: categoryDoc.name,
        industryType: industryTypeDoc.name,
        state: stateDoc.state,
        city: cityToSave || null,

        salaryType: salaryTypeDoc.name,
        jobType: jobTypeDoc.name,

        skills: skillsNames, // array of names

        experience: experienceDoc.name,
        otherField: otherFieldDoc.name,
        workingShift: workingShiftDoc.name,
       
        jobProfile: jobProfileDoc.name,

        jobTitle: jobPost.jobTitle,
        jobDescription: jobPost.jobDescription,
      
        minSalary: jobPost.minSalary,
        maxSalary: jobPost.maxSalary,
        displayPhoneNumber: jobPost.displayPhoneNumber,
        displayEmail: jobPost.displayEmail,
        hourlyRate: jobPost.hourlyRate,
        status: jobPost.status,
        expiredDate: formattedExpiredDate,
        jobPosted: daysAgo(jobPost.createdAt)
      }
    });

  } catch (error) {
    console.error("Error creating job post:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to create job post.",
      error: error.message
    });
  }
};


//correct
exports.adminApproveJobPost = async (req, res) => {
  try {
    const { role } = req.user || {};
    if (role !== "admin") {
      return res.status(403).json({ status: false, message: "Only admin can approve job posts." });
    }

    const { id, isAdminApproved } = req.body || {};
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid job post id is required." });
    }

    const post = await JobPost.findById(id);

    // 1) Not found
    if (!post) {
      return res.status(404).json({ status: false, message: "Job post not found." });
    }

    // 2) Found but already soft-deleted
    if (post.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This job post has been soft deleted and cannot be approved."
      });
    }

    // Default to true (approve) if omitted
    const nextVal = (typeof isAdminApproved === "boolean") ? isAdminApproved : true;

    // Can only APPROVE when status is ACTIVE
    if (nextVal === true && post.status !== "active") {
      return res.status(400).json({
        status: false,
        message: `Cannot approve job post while status is '${post.status}'.`
      });
    }

    // Idempotent response if no actual change
    if (post.isAdminApproved === nextVal) {
      return res.status(200).json({
        status: true,
        message: nextVal ? "Job post is already approved." : "Job post approval is already revoked.",
        data: { id: post._id, isAdminApproved: post.isAdminApproved, status: post.status }
      });
    }

    post.isAdminApproved = nextVal;
    await post.save();

    return res.status(200).json({
      status: true,
      message: nextVal ? "Job post approved." : "Job post approval revoked.",
      data: { id: post._id, isAdminApproved: post.isAdminApproved, status: post.status }
    });
  } catch (err) {
    console.error("adminApproveJobPost error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};




//correct for employer and job seeker
exports.getAllJobPosts = async (req, res) => {
  try {
    const { userId, role } = req.user || {};

    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized"
      });
    }

    // NEW: normalize role to avoid case issues
    const normRole = (role || "").toLowerCase();

    // NEW: allow only employer + job_seeker; block admin explicitly
    if (normRole === "admin") {
      return res.status(403).json({
        status: false,
        message: "Admins are not allowed to fetch job posts from this endpoint."
      });
    }
    if (normRole !== "employer" && normRole !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Forbidden: Only employers and job seekers are allowed."
      });
    }

    // Pagination
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip  = (page - 1) * limit;

    // Base filter: only non-deleted jobs
    const filter = { isDeleted: false };

    
    if (normRole === "employer") {
      filter.userId = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(userId)
        : userId;
    }
    

    // ---------- query params ----------
    const qTitle       = (req.query.q || req.query.jobTitle || "").trim();
    const stateName    = (req.query.state || "").trim();
    const cityParam    = (req.query.city  || "").trim();

    const categoryName = (req.query.category || "").trim();
    const industryName = (req.query.industryType || req.query.industry || "").trim();

    const jobProfile   = (req.query.jobProfile || "").trim();
    const salaryType   = (req.query.salaryType || "").trim();
    const experience   = (req.query.experience || "").trim();
    const jobType      = (req.query.jobType || "").trim();
    const workingShift = (req.query.workingShift || "").trim();
    const typeFlag     = (req.query.type || "").toLowerCase().trim(); // active|latest|saved



      // [skills] — accept ?skills=React js,Node js OR ?skills[]=... OR mixture of names/ids
    let skillsQueryRaw = req.query.skills;
    let skillsQueryArr = [];
    if (Array.isArray(skillsQueryRaw)) {
      // skills[]=A&skills[]=B
      skillsQueryArr = skillsQueryRaw.flatMap(v =>
        String(v).split(",").map(s => s.trim()).filter(Boolean)
      );
    } else if (typeof skillsQueryRaw === "string" && skillsQueryRaw.trim()) {
      // skills=A,B or single name/id
      skillsQueryArr = skillsQueryRaw.split(",").map(s => s.trim()).filter(Boolean);
    }




    // Title search
    if (qTitle) filter.jobTitle = { $regex: escapeRegex(qTitle), $options: "i" };

    // Type flags
    if (typeFlag) {
      if (typeFlag === "active") filter.isActive = true;
      else if (typeFlag === "latest") filter.isLatest = true;
      else if (typeFlag === "saved")  filter.isSaved  = true;
      else return res.status(400).json({ status: false, message: "Invalid type. Allowed: active, latest, saved." });
    }

    // ---------- lookups ----------
    const lookups = [];

    // State
    let stateDoc = null;
    if (stateName) {
      lookups.push(
        StateCity.findOne({ state: { $regex: `^${escapeRegex(stateName)}$`, $options: "i" } })
          .then(doc => { stateDoc = doc; })
      );
    }

    // Industry
    let industryDoc = null;
    if (industryName) {
      if (mongoose.Types.ObjectId.isValid(industryName)) {
        industryDoc = { _id: industryName };
      } else {
        lookups.push(
          IndustryType.findOne({
            name: { $regex: `^${escapeRegex(industryName)}$`, $options: "i" },
            isDeleted: false
          }).then(doc => { industryDoc = doc; })
        );
      }
    }

    // Category
    let categoryDoc = null;
    if (categoryName) {
      if (mongoose.Types.ObjectId.isValid(categoryName)) {
        categoryDoc = { _id: categoryName };
      } else {
        lookups.push(
          Category.findOne({
            name: { $regex: `^${escapeRegex(categoryName)}$`, $options: "i" },
            isDeleted: false
          }).then(doc => { categoryDoc = doc; })
        );
      }
    }

    // Job Profile
    let jobProfileDoc = null;
    if (jobProfile) {
      lookups.push(
        JobProfile.findOne({
          name: { $regex: `^${escapeRegex(jobProfile)}$`, $options: "i" },
          isDeleted: false
        }).then(doc => { jobProfileDoc = doc; })
      );
    }

    // Salary Type
    let salaryTypeDoc = null;
    if (salaryType) {
      lookups.push(
        SalaryType.findOne({
          name: { $regex: `^${escapeRegex(salaryType)}$`, $options: "i" },
          isDeleted: false
        }).then(doc => { salaryTypeDoc = doc; })
      );
    }

    // Experience
    let experienceDoc = null;
    if (experience) {
      lookups.push(
        Experience.findOne({
          name: { $regex: `^${escapeRegex(experience)}$`, $options: "i" },
          isDeleted: false
        }).then(doc => { experienceDoc = doc; })
      );
    }

    // Job Type
    let jobTypeDoc = null;
    if (jobType) {
      lookups.push(
        JobType.findOne({
          name: { $regex: `^${escapeRegex(jobType)}$`, $options: "i" },
          isDeleted: false
        }).then(doc => { jobTypeDoc = doc; })
      );
    }

   

    //working shift
    let workingShiftDoc = null;
    if (workingShift) {
            lookups.push(
        WorkingShift.findOne({
          name: { $regex: `^${escapeRegex(workingShift)}$`, $options: "i" },
          isDeleted: false
        }).then(doc => { workingShiftDoc = doc; })
      );
    }



     // [skills] resolve names/ids to Skill _ids (case-insensitive on field "skill")
    let skillIdsForFilter = [];
    if (skillsQueryArr.length) {
      const ids   = skillsQueryArr.filter(v => mongoose.isValidObjectId(v));
      const names = skillsQueryArr.filter(v => !mongoose.isValidObjectId(v));

      const nameRegexes = names.map(n => new RegExp(`^${escapeRegex(n)}$`, "i"));
      const [byId, byName] = await Promise.all([
        ids.length   ? Skill.find({ _id: { $in: ids }, isDeleted: false }) : [],
        names.length ? Skill.find({ skill: { $in: nameRegexes }, isDeleted: false }) : []
      ]);
      const all = [...byId, ...byName];
      skillIdsForFilter = all.map(d => d._id);

      // If user asked for skills but none matched, short-circuit to empty result
      if (!skillIdsForFilter.length) {
        return res.status(200).json({
          status: true, message: "Job posts fetched successfully.",
          totalRecord: 0, totalPage: 0, currentPage: page, data: []
        });
      }
      // Require posts that contain ALL provided skills:
      filter.skills = { $all: skillIdsForFilter };
      // If you want "any of" semantics instead, use: { $in: skillIdsForFilter }
    }


    await Promise.all(lookups);

    if (industryName && industryDoc) filter.industryType = industryDoc._id;
    if (categoryName && categoryDoc) filter.category     = categoryDoc._id;
    if (jobProfile && jobProfileDoc) filter.jobProfile   = jobProfileDoc._id;
    if (salaryType && salaryTypeDoc) filter.salaryType   = salaryTypeDoc._id;
    if (experience && experienceDoc) filter.experience   = experienceDoc._id;
    if (jobType && jobTypeDoc)       filter.jobType      = jobTypeDoc._id;

    if (workingShift && workingShiftDoc) filter.workingShift = workingShiftDoc._id;
    

    // ----- State & City -----
    if (stateName) {
      if (!stateDoc) {
        return res.status(200).json({
          status: true, message: "Job posts fetched successfully.",
          totalRecord: 0, totalPage: 0, currentPage: page, data: []
        });
      }
      filter.state = stateDoc._id;

      if (cityParam) {
        const ok = (stateDoc.cities || []).some(c => c.toLowerCase() === cityParam.toLowerCase());
        if (!ok) {
          return res.status(200).json({
            status: true, message: "Job posts fetched successfully.",
            totalRecord: 0, totalPage: 0, currentPage: page, data: []
          });
        }
        filter.city = { $regex: `^${escapeRegex(cityParam)}$`, $options: "i" };
      }
    } else if (cityParam) {
      // city only across all states
      filter.city = { $regex: `^${escapeRegex(cityParam)}$`, $options: "i" };
    }

    // ---------- query with pagination ----------
    const totalRecord = await JobPost.countDocuments(filter);
    const totalPage   = Math.ceil(totalRecord / limit) || 0;

    const posts = await JobPost.find(filter)
      .select("-updatedAt -__v")
      .populate({ path: "companyId",    select: "companyName image" })
      .populate({ path: "userId",       select: "phoneNumber role" })
      .populate({ path: "category",     select: "name" })
      .populate({ path: "industryType", select: "name" })
      .populate({ path: "salaryType",   select: "name" })
      .populate({ path: "jobType",      select: "name" })
      .populate({ path: "experience",   select: "name" })
      .populate({ path: "otherField",   select: "name" })
      .populate({ path: "workingShift", select: "name" })
      .populate({ path: "jobProfile",   select: "name" })
      
      .populate({ path: "state",        select: "state" })
       .populate({ path: "skills",       select: "skill" }) // [skills] populate names
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const data = posts.map(p => ({
      _id: p._id,
      userId:       p.userId?._id ?? null,
      userPhone:    p.userId?.phoneNumber ?? null,
      companyId:    p.companyId?._id ?? null,
      company:      p.companyId?.companyName ?? null,
      companyImage: p.companyId?.image ?? null,

      category:     p.category?.name ?? null,
      industryType: p.industryType?.name ?? null,
      salaryType:   p.salaryType?.name ?? null,
      jobType:      p.jobType?.name ?? null,
      experience:   p.experience?.name ?? null,
      otherField:   p.otherField?.name ?? null,
      workingShift: p.workingShift?.name ?? null,
      jobProfile:   p.jobProfile?.name ?? null,
     
      state:        p.state?.state ?? null,
      city:         p.city ?? null,

      jobTitle:           p.jobTitle ?? null,
      jobDescription:     p.jobDescription ?? null,


       // [skills] return array of skill names (fallback to raw ids if not populated)
      skills: Array.isArray(p.skills)
        ? p.skills.map(s => (s && typeof s === "object" && "skill" in s) ? s.skill : s)
        : [],


      minSalary:          p.minSalary ?? null,
      maxSalary:          p.maxSalary ?? null,
      displayPhoneNumber: p.displayPhoneNumber ?? null,
      displayEmail:       p.displayEmail ?? null,
      hourlyRate:         p.hourlyRate ?? null,
       appliedCandidates: p.appliedCandidates ?? null,

      status:          p.status,
      isAdminApproved: !!p.isAdminApproved,
     
      isActive:        !!p.isActive,
      isLatest:        !!p.isLatest,
      isSaved:         !!p.isSaved,
      isApplied:       !!p.isApplied,

      expiredDate: p.expiredDate ? new Date(p.expiredDate).toISOString().split("T")[0] : null,
      createdAt:  p.createdAt,
      jobPosted:  daysAgo(p.createdAt)
    }));

    return res.status(200).json({
      status: true,
      message: "Job posts fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
      data
    });
  } catch (error) {
    console.error("Error fetching job posts (unified):", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch job posts.",
      error: error.message
    });
  }
};




//correct
exports.getJobPostById = async (req, res) => {
  try {

     // ---------- auth & role checks ----------
    const { userId, role } = req.user || {};
    if (!userId) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }
    const normRole = (role || "").toLowerCase();
    if (normRole === "admin") {
      return res.status(403).json({
        status: false,
        message: "Admins are not allowed to fetch job posts from this endpoint."
      });
    }
    if (normRole !== "employer" && normRole !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Forbidden: Only employers and job seekers are allowed."
      });
    }

      // ---------- param validation ----------

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: false, message: "Invalid job post ID format." });
    }

     // ---------- fetch ----------

    let jobPost = await JobPost.findById(id)
      .select("-updatedAt -__v")
      .populate({ path: "companyId",    select: "companyName image" })
      .populate({ path: "category",     select: "name" })
      .populate({ path: "industryType", select: "name" })
      .populate({ path: "salaryType",   select: "name" })
      .populate({ path: "jobType",      select: "name" })
      .populate({ path: "experience",   select: "name" })
      .populate({ path: "otherField",   select: "name" })
      .populate({ path: "workingShift", select: "name" })
      
         .populate({ path: "skills",       select: "skill" })
         .populate({ path: "jobProfile", select: "name" })
      .populate({ path: "state",        select: "state" });

    if (!jobPost) {
      return res.status(404).json({ status: false, message: "Job post not found." });
    }

    if (jobPost.isDeleted === true) {
      return res.status(400).json({ status: false, message: "This job post has been already soft deleted." });
    }

     // ---------- employer ownership enforcement ----------
    if (normRole === "employer") {
      // Only allow if this job belongs to the requesting employer
      const ownerId = (jobPost.userId && jobPost.userId._id) ? jobPost.userId._id.toString() : jobPost.userId?.toString();
      if (!ownerId || ownerId !== userId.toString()) {
        return res.status(403).json({
          status: false,
          message: "Employers can only view their own job posts."
        });
      }
    }

    // ---------- auto mark expired (unchanged) ----------

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (jobPost.expiredDate && jobPost.expiredDate < today && jobPost.status !== "expired") {
      jobPost.status = "expired";
      await jobPost.save();
    }

    const data = {
      _id: jobPost._id,
      company:      jobPost.companyId?.companyName ?? null,
      companyImage: jobPost.companyId?.image ?? null,
      category:     jobPost.category?.name ?? null,
      industryType: jobPost.industryType?.name ?? null,
      salaryType:   jobPost.salaryType?.name ?? null,
      jobType:      jobPost.jobType?.name ?? null,
      experience:   jobPost.experience?.name ?? null,
      otherField:   jobPost.otherField?.name ?? null,
      workingShift: jobPost.workingShift?.name ?? null,
      
      jobProfile: jobPost.jobProfile?.name ?? null,
      state:        jobPost.state?.state ?? null,
city:         jobPost.city ?? null,

      jobTitle:           jobPost.jobTitle ?? null,
      jobDescription:     jobPost.jobDescription ?? null,
     

        // ✅ skills as array of names (fallback to ids if not populated)
      skills: Array.isArray(jobPost.skills)
        ? jobPost.skills.map(s => (s && typeof s === "object" && "skill" in s) ? s.skill : s)
        : [],


      minSalary:          jobPost.minSalary ?? null,
      maxSalary:          jobPost.maxSalary ?? null,
      displayPhoneNumber: jobPost.displayPhoneNumber ?? null,
      displayEmail:       jobPost.displayEmail ?? null,
      hourlyRate:         jobPost.hourlyRate ?? null,
       appliedCandidates: jobPost.appliedCandidates ?? null,

      status:    jobPost.status,
      isApplied: !!jobPost.isApplied,
      isActive:  !!jobPost.isActive,
      isSaved:   !!jobPost.isSaved,
      isLatest:  !!jobPost.isLatest,

      expiredDate: jobPost.expiredDate ? jobPost.expiredDate.toISOString().split("T")[0] : null,
      createdAt: jobPost.createdAt,

      // ✅ use your top-level helper that returns "0 days ago", "2 days ago", etc.
      jobPosted: daysAgo(jobPost.createdAt)
    };

    return res.status(200).json({ 
      status: true, 
      message: "Job post fetched successfully.", data });
  } catch (error) {

    console.error("Error fetching job post by ID:", error);

    return res.status(500).json({ 
      status: false, 
      message: "Failed to fetch job post.", error: error.message
     });
  }
};


//correct
exports.getAllJobPostsPublic = async (req, res) => {
  try {
    const page  = parseInt(req.query.page, 10)  || 1;
    const limit = parseInt(req.query.limit, 10) || 5;
    const skip  = (page - 1) * limit;

    const { jobTitle, state } = req.query;

    // 1) Build filter (only non-deleted; you can also enforce status:'active' if you want)
    const filter = { isDeleted: false };

    // jobTitle: case-insensitive contains
    if (jobTitle && jobTitle.trim()) {
      filter.jobTitle = { $regex: escapeRegex(jobTitle.trim()), $options: "i" };
    }

    // state by human name (StateCity.state)
    if (state && state.trim()) {
      const stateRegex = { $regex: escapeRegex(state.trim()), $options: "i" };
      const states = await StateCity.find({ state: stateRegex }).select("_id");
      const stateIds = states.map(s => s._id);
      if (stateIds.length === 0) {
        return res.status(200).json({
          status: true,
          message: "Job posts fetched successfully.",
          totalRecord: 0,
          totalPage: 0,
          currentPage: page,
          data: []
        });
      }
      filter.state = { $in: stateIds };
    }

    // 2) Count for pagination
    const totalRecord = await JobPost.countDocuments(filter);
    const totalPage   = Math.ceil(totalRecord / limit);

    // 3) Query (keep createdAt; exclude updatedAt/__v)
    const jobPosts = await JobPost.find(filter)
      .select("-updatedAt -__v")
      .populate({ path: "companyId",    select: "companyName image" })
      .populate({ path: "category",     select: "name" })
      .populate({ path: "industryType", select: "name" })
      .populate({ path: "salaryType",   select: "name" })
      .populate({ path: "jobType",      select: "name" })
      .populate({ path: "experience",   select: "name" })
      .populate({ path: "otherField",   select: "name" })
        .populate({ path: "workingShift",   select: "name" })
         .populate({ path: "jobProfile",   select: "name" })
      .populate({ path: "state",        select: "state" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // 4) Shape response
    const data = jobPosts.map(j => ({
      _id: j._id,

      company:      j.companyId?.companyName ?? null,
      companyImage: j.companyId?.image ?? null,

      category:     j.category?.name ?? null,
      industryType: j.industryType?.name ?? null,
      salaryType:   j.salaryType?.name ?? null,
      jobType:      j.jobType?.name ?? null,
      experience:   j.experience?.name ?? null,
      otherField:   j.otherField?.name ?? null,
       workingShift:   j.workingShift?.name ?? null,
       jobProfile:   j.jobProfile?.name ?? null,
      state:        j.state?.state ?? null,
      city:         j.city ?? null,

      jobTitle:           j.jobTitle ?? null,
      jobDescription:     j.jobDescription ?? null,
      skills:             j.skills ?? null,
      minSalary:          j.minSalary ?? null,
      maxSalary:          j.maxSalary ?? null,
      displayPhoneNumber: j.displayPhoneNumber ?? null,
      displayEmail:       j.displayEmail ?? null,
      hourlyRate:         j.hourlyRate ?? null,

      status: j.status,
      expiredDate: j.expiredDate ? new Date(j.expiredDate).toISOString().split("T")[0] : null,
      jobPosted: daysAgo(j.createdAt)
    }));

    // 5) Respond
    return res.status(200).json({
      status: true,
      message: "Job posts fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
      data
    });

  } catch (error) {
    console.error("Error fetching job posts:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch job posts.",
      error: error.message
    });
  }
};



//correct with flags updation agter admin approval only for employer
exports.updateJobPostById = async (req, res) => {
  try {
    const {
      id,
      category,
      industryType,
      state,
      city,
      salaryType,
      jobType,
      experience,
      otherField,
      workingShift,
      jobProfile,

     
      skills,

      isActive,
      isLatest,
      isSaved,
      status,
      ...updateData
    } = req.body || {};

    const { userId, role } = req.user || {};

    // Hard-block certain fields outright
    const forbiddenFields = ["isDeleted", "isAdminApproved", "appliedCandidates", "isApplied"];
    const attemptedForbidden = forbiddenFields.filter(f =>
      Object.prototype.hasOwnProperty.call(req.body, f)
    );
    if (attemptedForbidden.length) {
      return res.status(403).json({
        status: false,
        message: `Forbidden update: You cannot modify ${attemptedForbidden.join(", ")} from this endpoint.`
      });
    }

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: false, message: "Valid job post ID is required." });
    }

    if (typeof status !== "undefined") {
      return res.status(400).json({
        status: false,
        message: "Use /update-job-post-status to change status."
      });
    }

    // Load post
    const jobPost = await JobPost.findById(id);
    if (!jobPost) {
      return res.status(404).json({ status: false, message: "Job post not found." });
    }

    // Owner + employer only
    const isOwner = jobPost.userId?.toString() === String(userId);
    if (!isOwner || role !== "employer") {
      return res.status(403).json({ status: false, message: "You are not authorized to update this job post." });
    }

    // Soft-deleted?
    if (jobPost.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This job post has been soft deleted and cannot be updated."
      });
    }

    // Post must be ACTIVE to edit anything at all
    if (jobPost.status !== "active") {
      return res.status(403).json({
        status: false,
        message: "You can update a job post only when its status is 'active'."
      });
    }

    // ---------- Update simple fields (non-ref, non-protected) ----------
    const restricted = [
      "_id","userId","companyId","__v","isDeleted","deletedAt",
      "category","industryType","state","salaryType","jobType","city",
      "experience","otherField","workingShift","jobProfile","expiredDate","status",
      "isAdminApproved","isActive","isLatest","isSaved"
    ];
    Object.keys(updateData).forEach((k) => {
      if (!restricted.includes(k)) jobPost[k] = updateData[k];
    });

    // ---------- Resolve ref names (case-insensitive) ----------
    const findByName = (Model, key, value, extra = {}) =>
      value
        ? Model.findOne({ ...extra, name: { $regex: `^${escapeRegex(value)}$`, $options: "i" } })
        : null;

    if (category) {
      const doc = await findByName(Category, "name", category);
      if (!doc) return res.status(400).json({ status: false, message: "Invalid category name." });
      jobPost.category = doc._id;
    }

    if (industryType) {
      const doc = await findByName(IndustryType, "name", industryType);
      if (!doc) return res.status(400).json({ status: false, message: "Invalid industry type name." });
      jobPost.industryType = doc._id;
    }

    if (salaryType) {
      const doc = await findByName(SalaryType, "name", salaryType, { isDeleted: false });
      if (!doc) return res.status(400).json({ status: false, message: "Invalid or deleted salary type name." });
      jobPost.salaryType = doc._id;
    }

    if (jobType) {
      const doc = await findByName(JobType, "name", jobType, { isDeleted: false });
      if (!doc) return res.status(400).json({ status: false, message: "Invalid or deleted job type name." });
      jobPost.jobType = doc._id;
    }

    if (experience) {
      const doc = await findByName(Experience, "name", experience, { isDeleted: false });
      if (!doc) return res.status(400).json({ status: false, message: "Invalid or deleted experience name." });
      jobPost.experience = doc._id;
    }

    if (otherField) {
      const doc = await findByName(OtherField, "name", otherField, { isDeleted: false });
      if (!doc) return res.status(400).json({ status: false, message: "Invalid or deleted other field name." });
      jobPost.otherField = doc._id;
    }

    if (workingShift) {
      const doc = await findByName(WorkingShift, "name", workingShift, { isDeleted: false });
      if (!doc) return res.status(400).json({ status: false, message: "Invalid or deleted working shift name." });
      jobPost.workingShift = doc._id;
    }

    if (jobProfile) {
      const doc = await findByName(JobProfile, "name", jobProfile, { isDeleted: false });
      if (!doc) return res.status(400).json({ status: false, message: "Invalid or deleted job profile name." });
      jobPost.jobProfile = doc._id;
    }

    // ---------- State/City update logic ----------
    const hasState = Object.prototype.hasOwnProperty.call(req.body, "state");
    const hasCity  = Object.prototype.hasOwnProperty.call(req.body, "city");

    const resolveState = async (input) => {
      if (!input) return null;
      if (mongoose.Types.ObjectId.isValid(input)) return StateCity.findById(input);
      return StateCity.findOne({ state: { $regex: `^${escapeRegex(String(input))}$`, $options: "i" } });
    };

    if (hasState) {
      const stateDoc = await resolveState(state);
      if (!stateDoc) return res.status(400).json({ status: false, message: "Invalid state." });

      if (hasCity) {
        const cityVal = String(city || "").trim();
        if (!cityVal || !stateDoc.cities.includes(cityVal)) {
          return res.status(400).json({ status: false, message: "Invalid city for the selected state." });
        }
        jobPost.city = cityVal;
      } else {
        const existingCity = jobPost.city;
        if (existingCity && !stateDoc.cities.includes(existingCity)) {
          jobPost.city = null;
        }
      }
      jobPost.state = stateDoc._id;
    }

    if (!hasState && hasCity) {
      if (!jobPost.state) {
        return res.status(400).json({ status: false, message: "Cannot update city because state is missing on this job post." });
      }
      const stateDoc = await StateCity.findById(jobPost.state);
      if (!stateDoc) {
        return res.status(400).json({ status: false, message: "Stored state not found." });
      }
      const cityVal = String(city || "").trim();
      if (!cityVal || !stateDoc.cities.includes(cityVal)) {
        return res.status(400).json({ status: false, message: "Invalid city for the stored state." });
      }
      jobPost.city = cityVal;
    }

   
    // ---------- Skills update (array or CSV; ids or names) ----------
    const hasSkills = Object.prototype.hasOwnProperty.call(req.body, "skills");
    if (hasSkills) {
      let skillsList = [];
      if (Array.isArray(skills)) {
        skillsList = skills.flatMap(v => String(v).split(",")).map(s => s.trim()).filter(Boolean);
      } else if (typeof skills === "string") {
        skillsList = skills.split(",").map(s => s.trim()).filter(Boolean);
      } else if (skills == null) {
        skillsList = [];
      } else {
        return res.status(400).json({ status: false, message: "Invalid 'skills' format. Provide an array or a comma-separated string." });
      }

      if (!skillsList.length) {
        jobPost.skills = [];
      } else {
        const ids   = skillsList.filter(v => mongoose.isValidObjectId(v));
        const names = skillsList.filter(v => !mongoose.isValidObjectId(v));
        const nameRegexes = names.map(n => new RegExp(`^${escapeRegex(n)}$`, "i"));
        const [byId, byName] = await Promise.all([
          ids.length   ? Skill.find({ _id: { $in: ids }, isDeleted: false }) : [],
          names.length ? Skill.find({ skill: { $in: nameRegexes }, isDeleted: false }) : []
        ]);
        const all = [...byId, ...byName];
        if (!all.length) {
          return res.status(400).json({ status: false, message: "No valid skills found to update." });
        }
        jobPost.skills = all.map(d => d._id);
      }
    }

    // ---------- Expired Date update (active only; >= today; ignore if invalid) ----------
    let warningMsg = null; // collect non-fatal warnings
    const hasExpiredDate = Object.prototype.hasOwnProperty.call(req.body, "expiredDate");
    if (hasExpiredDate) {
      if (jobPost.status !== "active") {
        // With your global "active-only edits" check above this shouldn't be hit,
        // but keep it defensive.
        warningMsg = "Ignored expiredDate: can be updated only when job status is 'active'.";
      } else {
        const newExp = parseDateOnlyToUTC(req.body.expiredDate);
        if (!newExp) {
          warningMsg = "Ignored expiredDate: invalid format. Use 'YYYY-MM-DD' (e.g., 2025-09-10).";
        } else {
          const todayUTC = todayDateOnlyUTC();
          if (newExp.getTime() < todayUTC.getTime()) {
            warningMsg = `Ignored expiredDate: cannot be earlier than today (${formatDateOnlyUTC(todayUTC)}).`;
          } else {
            // Business rule: allow shortening or extending as long as >= today
            jobPost.expiredDate = newExp;
          }
        }
      }
    }

    // ---------- Flags: allowed only if admin approved AND active ----------
    const wantsFlagChange =
      typeof isActive !== "undefined" ||
      typeof isLatest !== "undefined" ||
      typeof isSaved  !== "undefined";

    const pending = {};
    if (wantsFlagChange) {
      if (!jobPost.isAdminApproved || jobPost.status !== "active") {
        const msg = !jobPost.isAdminApproved
          ? "Flags can be changed only after admin approval."
          : "Flags can be changed only when job status is 'active'.";
        // merge with previous warning (non-fatal)
        warningMsg = warningMsg ? `${warningMsg} ${msg}` : msg;
      } else {
        const toBool = (v) => v === true || v === "true" || v === 1 || v === "1";
        const dup = [];
        if (typeof isActive !== "undefined" && jobPost.isActive === toBool(isActive)) dup.push(`isActive is already ${jobPost.isActive}`);
        if (typeof isLatest !== "undefined" && jobPost.isLatest === toBool(isLatest)) dup.push(`isLatest is already ${jobPost.isLatest}`);
        if (typeof isSaved  !== "undefined" && jobPost.isSaved  === toBool(isSaved))  dup.push(`isSaved is already ${jobPost.isSaved}`);
        if (dup.length) {
          // non-fatal: just warn and continue with other fields
          const msg = `No change: ${dup.join(", ")}.`;
          warningMsg = warningMsg ? `${warningMsg} ${msg}` : msg;
        } else {
          if (typeof isActive !== "undefined") pending.isActive = toBool(isActive);
          if (typeof isLatest !== "undefined") pending.isLatest = toBool(isLatest);
          if (typeof isSaved  !== "undefined") pending.isSaved  = toBool(isSaved);
        }
      }
    }

    // Apply collected flag changes
    Object.entries(pending).forEach(([k, v]) => { jobPost[k] = v; });

    await jobPost.save();

    // ---------- Re-fetch populated for response ----------
    const populated = await JobPost.findById(jobPost._id)
      .select("-__v")
      .populate("category", "name")
      .populate("industryType", "name")
      .populate("state", "state")
      .populate("salaryType", "name")
      .populate("jobType", "name")
      .populate("experience", "name")
      .populate("otherField", "name")
      .populate("workingShift", "name")
      .populate("jobProfile", "name")
     
      .populate("skills", "skill")
      .lean();

    const out = {
      ...populated,
      category:      populated.category?.name ?? null,
      industryType:  populated.industryType?.name ?? null,
      state:         populated.state?.state ?? null,
      city:          populated.city ?? null,
      salaryType:    populated.salaryType?.name ?? null,
      jobType:       populated.jobType?.name ?? null,
      experience:    populated.experience?.name ?? null,
      otherField:    populated.otherField?.name ?? null,
      workingShift:  populated.workingShift?.name ?? null,
      jobProfile:    populated.jobProfile?.name ?? null,
    
      skills: Array.isArray(populated.skills)
        ? populated.skills.map(s => (s && typeof s === "object" && "skill" in s) ? s.skill : s)
        : [],
      isAdminApproved: !!populated.isAdminApproved,
      isActive:        !!populated.isActive,
      isLatest:        !!populated.isLatest,
      isSaved:         !!populated.isSaved,
    };

    if (out.expiredDate) {
      out.expiredDate = formatDateOnlyUTC(new Date(out.expiredDate)); // UTC-safe
    }
    out.jobPosted = daysAgo(out.createdAt);

    return res.status(200).json({
      status: true,
      message: warningMsg ? `Job post updated successfully. Note: ${warningMsg}` : "Job post updated successfully.",
      data: out
    });
  } catch (error) {
    console.error("Error updating job post:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to update job post.",
      error: error.message
    });
  }
};





exports.updateJobPostStatus = async (req, res) => {
  try {
    const { id, status } = req.body;
    const { userId } = req.user;

    if (!id) {
      return res.status(400).json({
        status: false,
        message: "Job post ID is required."
      });
    }

   
    const jobPost = await JobPost.findById(id);

    if (!jobPost) {
      return res.status(404).json({
        status: false,
        message: "Job post not found."
      });
    }

     if (jobPost.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This job post has been soft deleted and cannot be updated."
      });
    }

    
    if (jobPost.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to update this job post status."
      });
    }


     // normalize + validate incoming status
    const nextStatus = String(status || "").toLowerCase();
    if (nextStatus === "expired") {
      return res.status(400).json({
        status: false,
        message: "You cannot manually set status to 'expired'. It is set automatically based on expired date."
      });
    }
    if (!["active", "inactive"].includes(nextStatus)) {
      return res.status(400).json({
        status: false,
        message: "Invalid status value. Allowed values: 'active', 'inactive'."
      });
    }

    // auto-expire lock (cannot change status if already past expiry)
    const now = new Date();
    if (jobPost.expiredDate && now > jobPost.expiredDate) {
      jobPost.status = "expired";
      await jobPost.save();
      return res.status(400).json({
        status: false,
        message: "Job post is already expired. You cannot update its status."
      });
    }

    // 🔒 No-op guard: same status as current → reject
    if (jobPost.status === nextStatus) {
      return res.status(400).json({
        status: false,
        message: `No change: status is already '${nextStatus}'.`
      });
    }

    // apply and save
    jobPost.status = nextStatus;
    await jobPost.save();

   
    const populatedJobPost = await JobPost.findById(jobPost._id)
      .populate("category", "name")
      .populate("industryType", "name")
      .populate("state", "state") 
      .lean();

   
    populatedJobPost.category = populatedJobPost.category?.name || null;
    populatedJobPost.industryType = populatedJobPost.industryType?.name || null;
    populatedJobPost.state = populatedJobPost.state?.state || null;

   
    if (populatedJobPost.expiredDate) {
  populatedJobPost.expiredDate = new Date(populatedJobPost.expiredDate)
    .toISOString()
    .split("T")[0];
}

    return res.status(200).json({
      status: true,
      message: `Job post marked as ${nextStatus} successfully.`,
      data: populatedJobPost
    });

  } catch (error) {
    console.error("Error updating job post status:", error);
    res.status(500).json({
      status: false,
      message: "Failed to update job post status.",
      error: error.message
    });
  }
};



//correct
exports.deleteJobPostById = async (req, res) => {
  try {
    const { id } = req.body; 
    const { userId, role } = req.user;

   
    if (!id) {
      return res.status(400).json({
        status: false,
        message: "Job post ID is required."
      });
    }

    
    const jobPost = await JobPost.findOne({ _id: id, isDeleted: false });

    if (!jobPost) {
      return res.status(404).json({
        status: false,
        message: "Job post is already deleted."
      });
    }

   
    if (role !== "admin" && jobPost.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to delete this job post."
      });
    }

   
    jobPost.isDeleted = true;
    jobPost.status = "expired";
    jobPost.expiredDate = new Date();

    await jobPost.save();

    return res.status(200).json({
      status: true,
      message: "Job post deleted successfully (soft delete).",
    
    });

  } catch (error) {
    console.error("Error deleting job post:", error);
    res.status(500).json({
      status: false,
      message: "Failed to delete job post.",
      error: error.message
    });
  }
};



//get job details by job post id without token (correct)
exports.getJobDetailsPublic = async (req, res) => {
  try {
    const { id } = req.params;

    // fetch job by id (non-deleted only)
    let jobPost = await JobPost.findOne({ _id: id, isDeleted: false })
      .select("-updatedAt -__v")
      .populate({ path: "companyId",    select: "companyName image aboutCompany" })
      .populate({ path: "category",     select: "name" })
      .populate({ path: "industryType", select: "name" })
      .populate({ path: "salaryType",   select: "name" })
      .populate({ path: "jobType",      select: "name" })
      .populate({ path: "experience",   select: "name" })
      .populate({ path: "otherField",   select: "name" })
       .populate({ path: "workingShift",   select: "name" })
        .populate({ path: "jobProfile",   select: "name" })
      .populate({ path: "state",        select: "state" });

    if (!jobPost) {
      return res.status(404).json({ status: false, message: "Job post not found." });
    }

    // auto-mark expired
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (jobPost.expiredDate && jobPost.expiredDate < today && jobPost.status !== "expired") {
      jobPost.status = "expired";
      await jobPost.save();
    }

    const data = {
      _id: jobPost._id,

      company:        jobPost.companyId?.companyName ?? null,
      companyImage:   jobPost.companyId?.image ?? null,
      aboutCompany:   jobPost.companyId?.aboutCompany ?? null,

      category:       jobPost.category?.name ?? null,
      industryType:   jobPost.industryType?.name ?? null,
      salaryType:     jobPost.salaryType?.name ?? null,
      jobType:        jobPost.jobType?.name ?? null,
      experience:     jobPost.experience?.name ?? null,
      otherField:     jobPost.otherField?.name ?? null,
       workingShift:     jobPost.workingShift?.name ?? null,
        jobProfile:     jobPost.jobProfile?.name ?? null,
      state:          jobPost.state?.state ?? null,
       city:           jobPost.city ?? null,

      jobTitle:           jobPost.jobTitle ?? null,
      jobDescription:     jobPost.jobDescription ?? null,
      skills:             jobPost.skills ?? null,
      minSalary:          jobPost.minSalary ?? null,
      maxSalary:          jobPost.maxSalary ?? null,
      displayPhoneNumber: jobPost.displayPhoneNumber ?? null,
      displayEmail:       jobPost.displayEmail ?? null,
      hourlyRate:         jobPost.hourlyRate ?? null,

      status:      jobPost.status,
      isApplied:   !!jobPost.isApplied,
      expiredDate: jobPost.expiredDate ? jobPost.expiredDate.toISOString().split("T")[0] : null,

      createdAt: jobPost.createdAt,
      jobPosted: daysAgo(jobPost.createdAt)
    };

    return res.status(200).json({
      status: true,
      message: "Job details fetched successfully.",
      data
    });

  } catch (error) {
    console.error("Error fetching job post by ID (public):", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch job details.",
      error: error.message
    });
  }
};



//admin job list (type=latest, saved, active), applied all filters
exports.getJobList = async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page, 10)  || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip  = (page - 1) * limit;

    const filter = { isDeleted: false };

    const qTitle       = (req.query.q || req.query.jobTitle || "").trim();
    const stateName    = (req.query.state || "").trim();
    const cityParam    = (req.query.city  || "").trim();

    const categoryName = (req.query.category || "").trim();
    const industryName = (req.query.industryType || req.query.industry || "").trim();

    const jobProfile   = (req.query.jobProfile || "").trim();
    const salaryType   = (req.query.salaryType || "").trim();
    const experience   = (req.query.experience || "").trim();
    const jobType      = (req.query.jobType || "").trim();
    const workingShift = (req.query.workingShift || "").trim();
    const typeFlag     = (req.query.type || "").toLowerCase().trim(); // active|latest|saved

    if (qTitle) filter.jobTitle = { $regex: escapeRegex(qTitle), $options: "i" };

    if (typeFlag) {
      if (typeFlag === "active") filter.isActive = true;
      else if (typeFlag === "latest") filter.isLatest = true;
      else if (typeFlag === "saved")  filter.isSaved  = true;
      else return res.status(400).json({ status: false, message: "Invalid type. Allowed: active, latest, saved." });
    }

    // ---------- lookups ----------
    const lookups = [];

    // State by name (exact, case-insensitive)
    let stateDoc = null;
    if (stateName) {
      lookups.push(
        StateCity.findOne({ state: { $regex: `^${escapeRegex(stateName)}$`, $options: "i" } })
          .then(doc => { stateDoc = doc; })
      );
    }

    let industryDoc = null;
    if (industryName) {
      if (mongoose.Types.ObjectId.isValid(industryName)) {
        industryDoc = { _id: industryName };
      } else {
        lookups.push(
          IndustryType.findOne({
            name: { $regex: `^${escapeRegex(industryName)}$`, $options: "i" },
            isDeleted: false
          }).then(doc => { industryDoc = doc; })
        );
      }
    }

    let categoryDoc = null;
    if (categoryName) {
      if (mongoose.Types.ObjectId.isValid(categoryName)) {
        categoryDoc = { _id: categoryName };
      } else {
        lookups.push(
          Category.findOne({
            name: { $regex: `^${escapeRegex(categoryName)}$`, $options: "i" },
            isDeleted: false
          }).then(doc => { categoryDoc = doc; })
        );
      }
    }

    let jobProfileDoc = null;
    if (jobProfile) {
      lookups.push(
        JobProfile.findOne({
          name: { $regex: `^${escapeRegex(jobProfile)}$`, $options: "i" },
          isDeleted: false
        }).then(doc => { jobProfileDoc = doc; })
      );
    }

    let salaryTypeDoc = null;
    if (salaryType) {
      lookups.push(
        SalaryType.findOne({
          name: { $regex: `^${escapeRegex(salaryType)}$`, $options: "i" },
          isDeleted: false
        }).then(doc => { salaryTypeDoc = doc; })
      );
    }

    let experienceDoc = null;
    if (experience) {
      lookups.push(
        Experience.findOne({
          name: { $regex: `^${escapeRegex(experience)}$`, $options: "i" },
          isDeleted: false
        }).then(doc => { experienceDoc = doc; })
      );
    }

    let jobTypeDoc = null;
    if (jobType) {
      lookups.push(
        JobType.findOne({
          name: { $regex: `^${escapeRegex(jobType)}$`, $options: "i" },
          isDeleted: false
        }).then(doc => { jobTypeDoc = doc; })
      );
    }

    let workingShiftDoc = null;
    if (workingShift) {
      lookups.push(
        WorkingShift.findOne({
          name: { $regex: `^${escapeRegex(workingShift)}$`, $options: "i" },
          isDeleted: false
        }).then(doc => { workingShiftDoc = doc; })
      );
    }

    await Promise.all(lookups);

    if (industryName && industryDoc) filter.industryType = industryDoc._id;
    if (categoryName && categoryDoc) filter.category     = categoryDoc._id;
    if (jobProfile && jobProfileDoc) filter.jobProfile   = jobProfileDoc._id;
    if (salaryType && salaryTypeDoc) filter.salaryType   = salaryTypeDoc._id;
    if (experience && experienceDoc) filter.experience   = experienceDoc._id;
    if (jobType && jobTypeDoc)       filter.jobType      = jobTypeDoc._id;
    if (workingShift && workingShiftDoc) filter.workingShift = workingShiftDoc._id;
    

    // ----- State & City -----
    if (stateName) {
      // If state name was provided but not found -> 0 results
      if (!stateDoc) {
        return res.status(200).json({
          status: true, message: "Job posts fetched successfully.",
          totalRecord: 0, totalPage: 0, currentPage: page, data: []
        });
      }
      filter.state = stateDoc._id;

      // If city provided, verify it belongs to the state (case-insensitive)
      if (cityParam) {
        const ok = (stateDoc.cities || []).some(c => c.toLowerCase() === cityParam.toLowerCase());
        if (!ok) {
          return res.status(200).json({
            status: true, message: "Job posts fetched successfully.",
            totalRecord: 0, totalPage: 0, currentPage: page, data: []
          });
        }
        // exact, case-insensitive city match
        filter.city = { $regex: `^${escapeRegex(cityParam)}$`, $options: "i" };
      }
    } else if (cityParam) {
      // City-only filter across all states (exact, case-insensitive)
      filter.city = { $regex: `^${escapeRegex(cityParam)}$`, $options: "i" };
    }

    // ---------- query with pagination ----------
    const totalRecord = await JobPost.countDocuments(filter);
    const totalPage   = Math.ceil(totalRecord / limit) || 0;

    const posts = await JobPost.find(filter)
      .select("-updatedAt -__v")
      .populate({ path: "companyId",    select: "companyName image" })
      .populate({ path: "userId",       select: "phoneNumber role" })
      .populate({ path: "category",     select: "name" })
      .populate({ path: "industryType", select: "name" })
      .populate({ path: "salaryType",   select: "name" })
      .populate({ path: "jobType",      select: "name" })
      .populate({ path: "experience",   select: "name" })
      .populate({ path: "otherField",   select: "name" })
      .populate({ path: "workingShift", select: "name" })
      .populate({ path: "jobProfile",   select: "name" })
      .populate({ path: "state",        select: "state" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const data = posts.map(p => ({
      _id: p._id,
      userId:       p.userId?._id ?? null,
      userPhone:    p.userId?.phoneNumber ?? null,
      companyId:    p.companyId?._id ?? null,
      company:      p.companyId?.companyName ?? null,
      companyImage: p.companyId?.image ?? null,
      category:     p.category?.name ?? null,
      industryType: p.industryType?.name ?? null,
      salaryType:   p.salaryType?.name ?? null,
      jobType:      p.jobType?.name ?? null,
      experience:   p.experience?.name ?? null,
      otherField:   p.otherField?.name ?? null,
      workingShift: p.workingShift?.name ?? null,
      jobProfile:   p.jobProfile?.name ?? null,
      state:        p.state?.state ?? null,
      city:         p.city ?? null,
      jobTitle:           p.jobTitle ?? null,
      jobDescription:     p.jobDescription ?? null,
      skills:             p.skills ?? null,
      minSalary:          p.minSalary ?? null,
      maxSalary:          p.maxSalary ?? null,
      displayPhoneNumber: p.displayPhoneNumber ?? null,
      displayEmail:       p.displayEmail ?? null,
      hourlyRate:         p.hourlyRate ?? null,
      status:          p.status,
      isAdminApproved: !!p.isAdminApproved,
      isActive:        !!p.isActive,
      isLatest:        !!p.isLatest,
      isSaved:         !!p.isSaved,
      isApplied:       !!p.isApplied,
      expiredDate: p.expiredDate ? new Date(p.expiredDate).toISOString().split("T")[0] : null,
      createdAt:  p.createdAt,
      jobPosted:  daysAgo(p.createdAt)
    }));

    return res.status(200).json({
      status: true,
      message: "Job posts fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
      data
    });
  } catch (error) {
    console.error("Error fetching admin job list:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch job posts.",
      error: error.message
    });
  }
};



//admin update flags
exports.updateJobListById = async (req, res) => {
  try {
    const {
      id,
      category,
      industryType,
      state,
      city,
      salaryType,
      jobType,
      experience,
      otherField,
      workingShift, 
      jobProfile,   
      isActive,        
      isLatest,
      isSaved,
      status,           // ⛔ not allowed here (use status route)
      ...updateData     // other direct fields (title, desc, skills, min/maxSalary, etc.)
    } = req.body || {};

    const { userId, role } = req.user || {};
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: false, message: "Valid job post ID is required." });
    }

    // Block status updates in this endpoint
    if (typeof status !== "undefined") {
      return res.status(400).json({
        status: false,
        message: "Use /update-job-post-status to change status."
      });
    }

    // Load post
    const jobPost = await JobPost.findById(id);
    if (!jobPost) {
      return res.status(404).json({ status: false, message: "Job post not found." });
    }

   
    // Soft-deleted?
    if (jobPost.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This job post has been soft deleted and cannot be updated."
      });
    }

    // Post must be ACTIVE to edit anything at all
    if (jobPost.status !== "active") {
      return res.status(403).json({
        status: false,
        message: "You can update a job post only when its status is 'active'."
      });
    }

    // ---------- Update simple fields (non-ref, non-protected) ----------
    const restricted = [
      "_id","userId","companyId","__v","isDeleted","deletedAt",
      "category","industryType","state","salaryType","jobType",
      "experience","otherField","workingShift", "jobProfile", "expiredDate","status",
      "isAdminApproved","isActive","isLatest","isSaved"
    ];
    Object.keys(updateData).forEach((k) => {
      if (!restricted.includes(k)) jobPost[k] = updateData[k];
    });

    // ---------- Resolve ref names (case-insensitive) ----------
    const findByName = (Model, key, value, extra = {}) =>
      value
        ? Model.findOne({ ...extra, name: { $regex: `^${escapeRegex(value)}$`, $options: "i" } })
        : null;

    if (category) {
      const doc = await findByName(Category, "name", category);
      if (!doc) return res.status(400).json({ status: false, message: "Invalid category name." });
      jobPost.category = doc._id;
    }

    if (industryType) {
      const doc = await findByName(IndustryType, "name", industryType);
      if (!doc) return res.status(400).json({ status: false, message: "Invalid industry type name." });
      jobPost.industryType = doc._id;
    }

   

    if (salaryType) {
      const doc = await findByName(SalaryType, "name", salaryType, { isDeleted: false });
      if (!doc) return res.status(400).json({ status: false, message: "Invalid or deleted salary type name." });
      jobPost.salaryType = doc._id;
    }

    if (jobType) {
      const doc = await findByName(JobType, "name", jobType, { isDeleted: false });
      if (!doc) return res.status(400).json({ status: false, message: "Invalid or deleted job type name." });
      jobPost.jobType = doc._id;
    }

    if (experience) {
      const doc = await findByName(Experience, "name", experience, { isDeleted: false });
      if (!doc) return res.status(400).json({ status: false, message: "Invalid or deleted experience name." });
      jobPost.experience = doc._id;
    }

    if (otherField) {
      const doc = await findByName(OtherField, "name", otherField, { isDeleted: false });
      if (!doc) return res.status(400).json({ status: false, message: "Invalid or deleted other field name." });
      jobPost.otherField = doc._id;
    }

    if (workingShift) {
      const doc = await findByName(WorkingShift, "name", workingShift, { isDeleted: false });
      if (!doc) return res.status(400).json({ status: false, message: "Invalid or deleted working shift name." });
      jobPost.workingShift = doc._id;
    }


     if (jobProfile) {
      const doc = await findByName(JobProfile, "name", jobProfile, { isDeleted: false });
      if (!doc) return res.status(400).json({ status: false, message: "Invalid or deleted job profile name." });
      jobPost.jobProfile = doc._id;
    }


     // ---------- State/City update logic (robust) ----------
    const hasState = Object.prototype.hasOwnProperty.call(req.body, "state");
    const hasCity  = Object.prototype.hasOwnProperty.call(req.body, "city");

    // resolve state by id or human name (case-insensitive)
    const resolveState = async (input) => {
      if (!input) return null;
      if (mongoose.Types.ObjectId.isValid(input)) return StateCity.findById(input);
      return StateCity.findOne({ state: { $regex: `^${escapeRegex(String(input))}$`, $options: "i" } });
    };

    if (hasState) {
      const stateDoc = await resolveState(state);
      if (!stateDoc) {
        return res.status(400).json({ status: false, message: "Invalid state." });
      }

      if (hasCity) {
        const cityVal = String(city || "").trim();
        if (!cityVal || !stateDoc.cities.includes(cityVal)) {
          return res.status(400).json({ status: false, message: "Invalid city for the selected state." });
        }
        jobPost.city = cityVal; // valid pair
      } else {
        // If the stored city doesn't belong to the new state, clear it
        const existingCity = jobPost.city;
        if (existingCity && !stateDoc.cities.includes(existingCity)) {
          jobPost.city = null;
        }
      }

      jobPost.state = stateDoc._id; // always store as ObjectId
    }

    if (!hasState && hasCity) {
      // Validate city against the current stored state
      if (!jobPost.state) {
        return res.status(400).json({ status: false, message: "Cannot update city because state is missing on this job post." });
      }
      const stateDoc = await StateCity.findById(jobPost.state);
      if (!stateDoc) {
        return res.status(400).json({ status: false, message: "Stored state not found." });
      }
      const cityVal = String(city || "").trim();
      if (!cityVal || !stateDoc.cities.includes(cityVal)) {
        return res.status(400).json({ status: false, message: "Invalid city for the stored state." });
      }
      jobPost.city = cityVal;
    }


    // ---------- Flags: allowed only if admin approved AND active ----------
    const wantsFlagChange =
      typeof isActive !== "undefined" ||
      typeof isLatest !== "undefined" ||
      typeof isSaved  !== "undefined";

        let warningMsg = null;
        const pending = {};   

         if (wantsFlagChange) {
      // Not allowed? -> skip flags but still apply other fields
      if (!jobPost.isAdminApproved || jobPost.status !== "active") {
        warningMsg = !jobPost.isAdminApproved
          ? "Flags can be changed only after admin approval."
          : "Flags can be changed only when job status is 'active'.";
      } else {
        // Allowed — check for NO-OP duplicates
        const toBool = (v) => v === true || v === "true" || v === 1 || v === "1";
        const dup = [];

        if (typeof isActive !== "undefined" && jobPost.isActive === toBool(isActive)) {
          dup.push(`isActive is already ${jobPost.isActive}`);
        }
        if (typeof isLatest !== "undefined" && jobPost.isLatest === toBool(isLatest)) {
          dup.push(`isLatest is already ${jobPost.isLatest}`);
        }
        if (typeof isSaved !== "undefined" && jobPost.isSaved === toBool(isSaved)) {
          dup.push(`isSaved is already ${jobPost.isSaved}`);
        }

        if (dup.length) {
          // Nothing saved; tell caller there’s no change for those flags.
          return res.status(400).json({
            status: false,
            message: `No change: ${dup.join(", ")}.`
          });
        }


         // Apply flag changes (since they’re allowed and not duplicates)
        if (typeof isActive !== "undefined") pending.isActive = toBool(isActive);
        if (typeof isLatest !== "undefined") pending.isLatest = toBool(isLatest);
        if (typeof isSaved  !== "undefined") pending.isSaved  = toBool(isSaved);
      }
    }

    // ---------- Apply collected changes & save ----------
    Object.entries(pending).forEach(([k, v]) => { jobPost[k] = v; });

    
    await jobPost.save();

   
    // ---------- Re-fetch populated for response ----------
    const populated = await JobPost.findById(jobPost._id)
      .populate("category", "name")
      .populate("industryType", "name")
      .populate("state", "state")
      .populate("salaryType", "name")
      .populate("jobType", "name")
      .populate("experience", "name")
      .populate("otherField", "name")
      .populate("workingShift", "name")
      .populate("jobProfile", "name")
      .lean();

    const out = {
      ...populated,
      category:      populated.category?.name ?? null,
      industryType:  populated.industryType?.name ?? null,
      state:         populated.state?.state ?? null,

       city:          populated.city ?? null,

      salaryType:    populated.salaryType?.name ?? null,
      jobType:       populated.jobType?.name ?? null,
      experience:    populated.experience?.name ?? null,
      otherField:    populated.otherField?.name ?? null,
      workingShift:  populated.workingShift?.name ?? null,

       jobProfile:  populated.jobProfile?.name ?? null,

      isAdminApproved: !!populated.isAdminApproved,
      isActive:        !!populated.isActive,
      isLatest:        !!populated.isLatest,
      isSaved:         !!populated.isSaved,
    };

    if (out.expiredDate) {
      out.expiredDate = new Date(out.expiredDate).toISOString().split("T")[0];
    }

    // ✅ Use your top-level daysAgo() util so it returns "0 days ago"
    out.jobPosted = daysAgo(out.createdAt);

    return res.status(200).json({
      status: true,
     message: warningMsg || "Job post updated successfully.",
      data: out
    });
  } catch (error) {
    console.error("Error updating job post:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to update job post.",
      error: error.message
    });
  }
};

