const JobPost = require("../models/JobPost");
const CompanyProfile = require("../models/CompanyProfile");
const IndustryType = require("../models/AdminIndustry");
const Category = require("../models/AdminCategory");
const StateCity = require("../models/StateCity");
const SavedJob = require("../models/SavedJobSeeker");
const JobApplication= require("../models/JobApplication");

const ExperienceRange = require("../models/AdminExperienceRange");

const SalaryType = require("../models/AdminSalaryType");
const JobType = require("../models/AdminJobType");
const Experience = require("../models/AdminExperienceRange");     
const OtherField = require("../models/AdminOtherField");
const WorkingShift   = require("../models/AdminWorkingShift"); 
const JobProfile   = require("../models/AdminJobProfile"); 
const JobSeekerSkill = require("../models/JobSeekerSkill");
const List = require("../models/ProfessionalKeyword");
 
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


const asNullableNumber = (v) =>
  v === undefined || v === null || String(v).trim() === "" ? null : Number(v);


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

     
      expiredDate

    } = req.body || {};

      

    // quick required checks
    const required = { category, industryType, salaryType, jobType, experience, otherField, workingShift };
    for (const [k, v] of Object.entries(required)) {
      if (!v || !String(v).trim()) {
        return res.status(400).json({ status: false, message: `${k} is required` });
      }
    }


      // New rule: at least one of state or city must be provided
    if ((!state || !String(state).trim()) && (!city || !String(city).trim())) {
      return res.status(400).json({
        status: false,
        message: "Either state or city is required."
      });
    }



   // skills must be a non-empty array of strings
    if (!Array.isArray(skills) || skills.length === 0) {
      return res.status(400).json({ status: false, message: "skills must be a non-empty array." });
    }
    // normalize, trim, drop empties, uniq (case-insensitive)
    const dedup = new Map();
    for (const s of skills) {
      if (typeof s !== "string") continue;
      const trimmed = s.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!dedup.has(key)) dedup.set(key, trimmed);
    }
    const skillsToSave = Array.from(dedup.values());
    if (skillsToSave.length === 0) {
      return res.status(400).json({ status: false, message: "skills must contain at least one valid string." });
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
   
      
      experienceDoc,
      otherFieldDoc,
      workingShiftDoc,
    
     
    ] = await Promise.all([

      Category.findOne({ name: category }),
      IndustryType.findOne({ name: industryType }),
      SalaryType.findOne({ name: salaryType, isDeleted: false }),
      JobType.findOne({ name: jobType, isDeleted: false }),
      
    
      Experience.findOne({ name: experience, isDeleted: false }), 
      OtherField.findOne({ name: otherField, isDeleted: false }),
      WorkingShift.findOne({ name: workingShift, isDeleted: false }),
     
       
    ]);

    if (!categoryDoc)     return res.status(400).json({ status: false, message: "Invalid category name." });
    if (!industryTypeDoc) return res.status(400).json({ status: false, message: "Invalid industry type name." });
    if (!salaryTypeDoc)   return res.status(400).json({ status: false, message: "Invalid or deleted salary type name." });
    if (!jobTypeDoc)      return res.status(400).json({ status: false, message: "Invalid or deleted job type name." });
   

    if (!experienceDoc)   return res.status(400).json({ status: false, message: "Invalid or deleted experience name." });
    if (!otherFieldDoc)   return res.status(400).json({ status: false, message: "Invalid or deleted other field name." });
    if (!workingShiftDoc)   return res.status(400).json({ status: false, message: "Invalid or deleted working shift name." });



     // --- Resolve state & validate/normalize city ---
    let stateDoc = null;
    let cityToSave = undefined;

    // If state provided, fetch it
    if (state && String(state).trim()) {
      stateDoc = await StateCity.findOne({ state: String(state).trim() });
      if (!stateDoc) {
        return res.status(400).json({ status: false, message: "Invalid state name." });
      }
    }

    if (city && String(city).trim()) {
      const normCity = String(city).trim().toLowerCase();

      // If state missing, infer state from city
      if (!stateDoc) {
        stateDoc = await StateCity.findOne({
          cities: { $elemMatch: { $regex: new RegExp(`^${escapeRegex(city)}$`, "i") } }
        });
        if (!stateDoc) {
          return res.status(400).json({
            status: false,
            message: "City not found in any state.",
          });
        }
      }

      // Validate city is in this state's cities and canonicalize casing
      const allowed = (stateDoc.cities || []).find(c => String(c).toLowerCase() === normCity);
      if (!allowed) {
        // City provided but not in the resolved state
        return res.status(400).json({
          status: false,
          message: "Invalid city for selected state.",
          allowedCities: stateDoc.cities || []
        });
      }
      cityToSave = allowed; // canonical capitalization from DB
    }


    

// expiry (+30 days default)
    let expiry = expiredDate ? new Date(expiredDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (isNaN(expiry.getTime())) {
      return res.status(400).json({ status: false, message: "Invalid expiredDate." });
    }


        // Safety: by here stateDoc must exist (either provided or inferred)
    if (!stateDoc) {
      return res.status(400).json({ status: false, message: "Unable to resolve state. Provide a valid state or city." });
    }



    // create job (save ObjectIds)
    const jobPost = await JobPost.create({
      userId,
      companyId: company._id,
      category: categoryDoc._id,
      industryType: industryTypeDoc._id,
      salaryType: salaryTypeDoc._id,
      jobType: jobTypeDoc._id,
      

        state: stateDoc._id,              // <- resolved from state or inferred from city
      city: cityToSave,   
      
      
      experience: experienceDoc._id,
      otherField: otherFieldDoc._id,
      workingShift: workingShiftDoc._id,
    
   
      jobProfile: jobProfile ? String(jobProfile).trim() : null,

      jobTitle,
      jobDescription,
      skills: skillsToSave, 

      minSalary,
      maxSalary,
      displayPhoneNumber,
      displayEmail,

      

      expiredDate: expiry,
      status: "active",
        adminAprrovalJobs: "Pending",


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

       
        category: categoryDoc.name,
        industryType: industryTypeDoc.name,


         state: stateDoc.state,                 // <- inferred or provided
        city: cityToSave || null,

        salaryType: salaryTypeDoc.name,
        jobType: jobTypeDoc.name,

        skills: jobPost.skills,  

        experience: experienceDoc.name,
        otherField: otherFieldDoc.name,
        workingShift: workingShiftDoc.name,
       
        jobProfile: jobPost.jobProfile,

      

        jobTitle: jobPost.jobTitle,
        jobDescription: jobPost.jobDescription,

       

        minSalary: jobPost.minSalary,
        maxSalary: jobPost.maxSalary,
        displayPhoneNumber: jobPost.displayPhoneNumber,
        displayEmail: jobPost.displayEmail,

      

 adminAprrovalJobs: jobPost.adminAprrovalJobs, 
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


//admin can only approve job post
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
        message: "This job post has been deleted and cannot be approved."
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




//admin can only recommend job post
exports.adminRecommendJobPost = async (req, res) => {
  try {
    const { role } = req.user || {};
    if (role !== "admin") {
      return res.status(403).json({ status: false, message: "Only admin can recommend job posts." });
    }

    const { id, adminRecommended } = req.body || {};
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid job post id is required." });
    }

    // default to approving (true) if omitted
    const nextVal = (typeof adminRecommended === "boolean") ? adminRecommended : true;

    // First fetch to (a) validate guards and (b) support idempotent messaging
    const post = await JobPost.findById(id).lean();
    if (!post) {
      return res.status(404).json({ status: false, message: "Job post not found." });
    }

    // Soft-deleted cannot be recommended or modified (you can relax this for revoke if you want)
    if (post.isDeleted) {
      return res.status(400).json({ status: false, message: "Cannot modify a soft-deleted job post." });
    }

    // If approving, must be active
    if (nextVal === true && post.status !== "active") {
      return res.status(400).json({ status: false, message: `Cannot recommend job post while status is '${post.status}'.` });
    }

    // Idempotent: if value is already the same, don't write—just inform
    if (post.adminRecommended === nextVal) {
      return res.status(200).json({
        status: true,
        message: nextVal ? "Job post is already recommended." : "Job post recommendation is already revoked.",
        
      });
    }

    // Perform the update
    const updated = await JobPost.findOneAndUpdate(
      { _id: id },                        // guards already checked above
      { $set: { adminRecommended: nextVal } },
      { new: true, projection: { _id: 1, adminRecommended: 1 } }
    );

    return res.status(200).json({
      status: true,
      message: nextVal ? "Job post recommended." : "Job post recommendation revoked.",
      data: { id: updated._id, adminRecommended: updated.adminRecommended }
    });
  } catch (err) {
    console.error("adminRecommendJobPost error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};






//get recommended job list for job seekers only
exports.getRecommendedJobs = async (req, res) => {
  try {
    const { role } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can access recommended job posts."
      });
    }

    // ---- pagination ----
    const page  = Math.max(parseInt(req.query.page, 10)  || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip  = (page - 1) * limit;

    // ---- filter ----
    const filter = { adminRecommended: true, isDeleted: false };

    // ---- count ----
    const totalRecord = await JobPost.countDocuments(filter);
    const totalPage   = Math.max(Math.ceil(totalRecord / limit), 1);

    // Helper to pick a reasonable display name from various ref schemas
    const pickName = (obj) =>
      obj?.name ?? obj?.title ?? obj?.label ?? obj?.range ?? obj?.experience ?? null;

    

    // helper: format Date -> "dd-mm-yyyy"
const formatDDMMYYYY = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};




    // ---- query + populate ----
    const posts = await JobPost.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      // select only fields you need from JobPost
      .select(`
        userId companyId category industryType jobTitle jobDescription salaryType
        displayPhoneNumber displayEmail jobType skills minSalary maxSalary state city
        experience otherField workingShift jobProfile status hourlyRate expiredDate
        isApplied isLatest isSaved isActive appliedCandidates isAdminApproved
        adminRecommended
      `)
      // populate minimal fields to flatten later
      .populate("companyId", "companyName image")
      .populate("category", "name")
      .populate("industryType", "name")
      .populate("jobType", "name")
      .populate("skills", "skill")
      .populate("state", "state name")          // handle either schema: state/state.name
      .populate("workingShift", "name title")
      .populate("otherField", "name title")
      .populate("experience", "name label range experience title")
       .populate("salaryType", "name title label")
      .lean();

    // ---- shape/flatten the payload ----
    const jobPosts = posts.map(p => ({
      _id: p._id,
      userId: p.userId,

      // company
      companyName: p.companyId?.companyName ?? null,
    companyImage: p.companyId?.image ?? null, 
      // simple strings (no nested object)
      category: pickName(p.category),
      industryType: pickName(p.industryType),
      jobType: pickName(p.jobType),
      workingShift: pickName(p.workingShift),
      otherField: pickName(p.otherField),
      experience: pickName(p.experience),

      // state can be 'state' or 'name' depending on your StateCity schema
      state: p.state?.state ?? p.state?.name ?? null,

      // skills as array of strings
      skills: Array.isArray(p.skills) ? p.skills.map(s => s?.skill).filter(Boolean) : [],

      // passthrough fields you still want
      jobTitle: p.jobTitle,
      jobDescription: p.jobDescription,
      salaryType: pickName(p.salaryType),     
                   // if you want its name, also populate SalaryType and use pickName
      displayPhoneNumber: p.displayPhoneNumber,
      displayEmail: p.displayEmail,
      minSalary: p.minSalary,
      maxSalary: p.maxSalary,
      city: p.city,
      jobProfile: p.jobProfile ?? null,     // populate + pickName if you need its label
      status: p.status,
      hourlyRate: p.hourlyRate,
     expiredDate: formatDDMMYYYY(p.expiredDate), 
      isApplied: p.isApplied,
      isLatest: p.isLatest,
      isSaved: p.isSaved,
      isActive: p.isActive,
      appliedCandidates: p.appliedCandidates,
      isAdminApproved: p.isAdminApproved,
      adminRecommended: p.adminRecommended,
     
    }));

    return res.status(200).json({
      status: true,
      message: "Recommended job posts fetched successfully.",
       data: {
      totalRecord,
      totalPage,
      currentPage: page,
      jobPosts 
    }
    });


  } catch (err) {
    console.error("getRecommendedJobs error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};




//for employer and job seeker
exports.getAllJobPosts = async (req, res) => {
  try {
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

    // pagination
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip  = (page - 1) * limit;

    // base filter
    const filter = { isDeleted: false };

    // EMPLOYER: only their own posts
   if (normRole === "employer") {
      // Employer -> only his/her own posts (all approval states allowed)
      filter.userId = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(userId)
        : userId;
    } else if (normRole === "job_seeker") {
      // Job seeker -> only Admin Approved posts
      filter.adminAprrovalJobs = "Approved";

      
    }

    // ⛔ EXCLUDE EXPIRED JOBS
filter.expiredDate = { $gte: new Date() };



    // ----- query params -----
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

    // skills (strings; array or csv)
    let skillsQueryRaw = req.query.skills;
    let skillsQueryArr = [];
    if (Array.isArray(skillsQueryRaw)) {
      skillsQueryArr = skillsQueryRaw.flatMap(v =>
        String(v).split(",").map(s => s.trim()).filter(Boolean)
      );
    } else if (typeof skillsQueryRaw === "string" && skillsQueryRaw.trim()) {
      skillsQueryArr = skillsQueryRaw.split(",").map(s => s.trim()).filter(Boolean);
    }

    if (qTitle) filter.jobTitle = { $regex: escapeRegex(qTitle), $options: "i" };

    if (typeFlag) {
      if (typeFlag === "active") filter.isActive = true;
      else if (typeFlag === "latest") filter.isLatest = true;
      else if (typeFlag === "saved")  filter.isSaved  = true;
      else return res.status(400).json({ status: false, message: "Invalid type. Allowed: active, latest, saved." });
    }

    const lookups = [];
    let stateDoc = null;
    if (stateName) {
      lookups.push(
        StateCity.findOne({ state: { $regex: `^${escapeRegex(stateName)}$`, $options: "i" } })
          .then(doc => { stateDoc = doc; })
      );
    }

    let industryDoc = null;
    if (industryName) {
      if (mongoose.Types.ObjectId.isValid(industryName)) industryDoc = { _id: industryName };
      else {
        lookups.push(
          IndustryType.findOne({ name: { $regex: `^${escapeRegex(industryName)}$`, $options: "i" }, isDeleted: false })
            .then(doc => { industryDoc = doc; })
        );
      }
    }

    let categoryDoc = null;
    if (categoryName) {
      if (mongoose.Types.ObjectId.isValid(categoryName)) categoryDoc = { _id: categoryName };
      else {
        lookups.push(
          Category.findOne({ name: { $regex: `^${escapeRegex(categoryName)}$`, $options: "i" }, isDeleted: false })
            .then(doc => { categoryDoc = doc; })
        );
      }
    }

    let jobProfileDoc = null;
    if (jobProfile) {
      lookups.push(
        JobProfile.findOne({ name: { $regex: `^${escapeRegex(jobProfile)}$`, $options: "i" }, isDeleted: false })
          .then(doc => { jobProfileDoc = doc; })
      );
    }

    let salaryTypeDoc = null;
    if (salaryType) {
      lookups.push(
        SalaryType.findOne({ name: { $regex: `^${escapeRegex(salaryType)}$`, $options: "i" }, isDeleted: false })
          .then(doc => { salaryTypeDoc = doc; })
      );
    }

    let experienceDoc = null;
    if (experience) {
      lookups.push(
        Experience.findOne({ name: { $regex: `^${escapeRegex(experience)}$`, $options: "i" }, isDeleted: false })
          .then(doc => { experienceDoc = doc; })
      );
    }

    let jobTypeDoc = null;
    if (jobType) {
      lookups.push(
        JobType.findOne({ name: { $regex: `^${escapeRegex(jobType)}$`, $options: "i" }, isDeleted: false })
          .then(doc => { jobTypeDoc = doc; })
      );
    }

    let workingShiftDoc = null;
    if (workingShift) {
      lookups.push(
        WorkingShift.findOne({ name: { $regex: `^${escapeRegex(workingShift)}$`, $options: "i" }, isDeleted: false })
          .then(doc => { workingShiftDoc = doc; })
      );
    }

      // skills filter: require ALL specified skills to be present (case-insensitive)
    if (skillsQueryArr.length) {
      const regexes = skillsQueryArr.map(n => new RegExp(`^${escapeRegex(n)}$`, "i"));
      filter.skills = { $all: regexes };
    }

    await Promise.all(lookups);
    if (industryName && industryDoc) filter.industryType = industryDoc._id;
    if (categoryName && categoryDoc) filter.category     = categoryDoc._id;
    if (jobProfile && jobProfileDoc) filter.jobProfile   = jobProfileDoc._id;
    if (salaryType && salaryTypeDoc) filter.salaryType   = salaryTypeDoc._id;
    if (experience && experienceDoc) filter.experience   = experienceDoc._id;
    if (jobType && jobTypeDoc)       filter.jobType      = jobTypeDoc._id;
    if (workingShift && workingShiftDoc) filter.workingShift = workingShiftDoc._id;

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
      filter.city = { $regex: `^${escapeRegex(cityParam)}$`, $options: "i" };
    }

    // ---------- Fetch posts ----------
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
      // .populate({ path: "skills",       select: "skill" }) // skills are strings, not refs
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // -------- Applications stats (for all fetched posts) --------
    let appCountByPost = new Map();        // total Applied
    let pendingByPost  = new Map();        // employerApprovalStatus: Pending

    if (posts.length) {
      const postIds = posts.map(p => p._id);
      const appAgg = await JobApplication.aggregate([
        { $match: { jobPostId: { $in: postIds }, status: "Applied" } },
        {
          $group: {
            _id: "$jobPostId",
            totalApplied: { $sum: 1 },
            pending: {
              $sum: {
                $cond: [{ $eq: ["$employerApprovalStatus", "Pending"] }, 1, 0]
              }
            }
          }
        }
      ]);

      for (const d of appAgg) {
        appCountByPost.set(String(d._id), d.totalApplied || 0);
        pendingByPost.set(String(d._id), d.pending || 0);
      }
    }

    // -------- ROLE-BASED isApplied --------
    // 1) JOB SEEKER: isApplied = user has an active application on that post
    let seekerAppliedSet = new Set();
    if (normRole === "job_seeker" && posts.length) {
      const postIds = posts.map(p => p._id);
      const activeApps = await JobApplication.find({
        userId: new mongoose.Types.ObjectId(userId),
        jobPostId: { $in: postIds },
        status: "Applied"
      }).select("jobPostId").lean();

      seekerAppliedSet = new Set(activeApps.map(a => String(a.jobPostId)));
    }

    // 2) EMPLOYER: isApplied = there exists at least one active application for that post
    const employerHasActiveAppSet =
      new Set([...appCountByPost.entries()].filter(([, c]) => c > 0).map(([id]) => id));

    // ---------- Response mapping ----------
    const data = posts.map(p => {
      const idStr = String(p._id);
      return {
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

        jobTitle:       p.jobTitle ?? null,
        jobDescription: p.jobDescription ?? null,

        // skills are stored as strings
        skills: Array.isArray(p.skills) ? p.skills : [],

        minSalary:          p.minSalary ?? null,
        maxSalary:          p.maxSalary ?? null,
        displayPhoneNumber: p.displayPhoneNumber ?? null,
        displayEmail:       p.displayEmail ?? null,
        hourlyRate:         p.hourlyRate ?? null,

        // ✅ live-calculated counts
        appliedCandidates:  appCountByPost.get(idStr) || 0,
        applicationsPending: pendingByPost.get(idStr) || 0,

        status:          p.status,
        isAdminApproved: !!p.isAdminApproved,
        isActive:        !!p.isActive,
        isLatest:        !!p.isLatest,
        isSaved:         !!p.isSaved,

        // KEY: role-based `isApplied`
        isApplied: normRole === "job_seeker"
          ? seekerAppliedSet.has(idStr)               // per-user
          : employerHasActiveAppSet.has(idStr),       // any active app on that post

        expiredDate: p.expiredDate ? new Date(p.expiredDate).toISOString().split("T")[0] : null,
        createdAt:  p.createdAt,
        jobPosted:  daysAgo(p.createdAt)
      };
    });

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
      return res.status(400).json({ status: false, message: "This job post has been already deleted." });
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




exports.getAllJobPostsPublic = async (req, res) => {
  try {
    // -------- pagination --------
    const page  = parseInt(req.query.page, 10)  || 1;
    const limit = parseInt(req.query.limit, 10) || 5;
    const skip  = (page - 1) * limit;

    // -------- params (NO `skills` param anymore) --------
    const { jobTitle, city, jobType, industryType, experience } = req.query;

    // -------- base filter --------
    const filter = { isDeleted: false, adminAprrovalJobs: "Approved" };

    // -------- unified search: jobTitle param searches BOTH title and skills --------
    // supports comma-separated terms in `jobTitle`
    if (jobTitle && jobTitle.trim()) {
      const terms = jobTitle
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

      const ors = [];
      for (const t of terms) {
        const rx = new RegExp(escapeRegex(t), "i");      // contains match, case-insensitive
        // Match in title OR in any element of the skills array (array of strings)
        ors.push({ jobTitle: rx });
        ors.push({ skills: rx }); // regex on an array field matches any element
      }
      if (ors.length) filter.$or = ors;
    }

    // -------- city: case-insensitive exact --------
    if (city && city.trim()) {
      filter.city = { $regex: new RegExp(`^${escapeRegex(city.trim())}$`, "i") };
    }

    // -------- jobType: comma-separated names -> ids --------
    if (jobType && jobType.trim()) {
      const names = jobType.split(",").map(s => s.trim()).filter(Boolean);
      if (names.length) {
        const regexes = names.map(n => new RegExp(`^${escapeRegex(n)}$`, "i"));
        const docs = await JobType
          .find({ name: { $in: regexes }, isDeleted: false })
          .select("_id");
        const ids = docs.map(d => d._id);
        if (!ids.length) {
          return res.status(200).json({
            status: true,
            message: "Job posts fetched successfully.",
            totalRecord: 0,
            totalPage: 0,
            currentPage: page,
            data: []
          });
        }
        filter.jobType = { $in: ids };
      }
    }

    // -------- industryType: comma-separated names -> ids --------
    if (industryType && industryType.trim()) {
      const names = industryType.split(",").map(s => s.trim()).filter(Boolean);
      if (names.length) {
        const regexes = names.map(n => new RegExp(`^${escapeRegex(n)}$`, "i"));
        const docs = await IndustryType
          .find({ name: { $in: regexes } })
          .select("_id");
        const ids = docs.map(d => d._id);
        if (!ids.length) {
          return res.status(200).json({
            status: true,
            message: "Job posts fetched successfully.",
            totalRecord: 0,
            totalPage: 0,
            currentPage: page,
            data: []
          });
        }
        filter.industryType = { $in: ids };
      }
    }


    // -------- experience: comma-separated names -> ids --------
if (experience && experience.trim()) {
  const names = experience.split(",").map(s => s.trim()).filter(Boolean);

  if (names.length) {
    const regexes = names.map(
      n => new RegExp(`^${escapeRegex(n)}$`, "i")
    );

    const docs = await ExperienceRange.find({
      name: { $in: regexes },
      isDeleted: false
    }).select("_id");

    const ids = docs.map(d => d._id);

    // No matching experience → return empty response
    if (!ids.length) {
      return res.status(200).json({
        status: true,
        message: "Job posts fetched successfully.",
        totalRecord: 0,
        totalPage: 0,
        currentPage: page,
        data: []
      });
    }

    // Add filter to JobPost query
    filter.experience = { $in: ids };
  }
}


// -------- salary range filter --------
const minSalaryParam = req.query.minSalary ? Number(req.query.minSalary) : null;
const maxSalaryParam = req.query.maxSalary ? Number(req.query.maxSalary) : null;

if (minSalaryParam !== null || maxSalaryParam !== null) {
  filter.$and = filter.$and || [];

  if (minSalaryParam !== null) {
    filter.$and.push({ minSalary: { $gte: minSalaryParam } });
  }

  if (maxSalaryParam !== null) {
    filter.$and.push({ maxSalary: { $lte: maxSalaryParam } });
  }
}


    // -------- counts for pagination --------
    const totalRecord = await JobPost.countDocuments(filter);
    const totalPage   = Math.ceil(totalRecord / limit);

    // -------- query --------
    const jobPosts = await JobPost.find(filter)
      .select("-updatedAt -__v")
      .populate({ path: "companyId",    select: "companyName image" })
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

    // -------- shape response --------
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
      workingShift: j.workingShift?.name ?? null,
      jobProfile:   j.jobProfile?.name ?? null,
      state:        j.state?.state ?? null,
      city:         j.city ?? null,

      jobTitle:         j.jobTitle ?? null,
      jobDescription:   j.jobDescription ?? null,
      skills: Array.isArray(j.skills) ? j.skills.filter(Boolean) : [],

      minSalary:          j.minSalary ?? null,
      maxSalary:          j.maxSalary ?? null,
      displayPhoneNumber: j.displayPhoneNumber ?? null,
      displayEmail:       j.displayEmail ?? null,
      hourlyRate:         j.hourlyRate ?? null,

      status: j.status,
      expiredDate: j.expiredDate ? new Date(j.expiredDate).toISOString().split("T")[0] : null,
      jobPosted: daysAgo(j.createdAt),
      adminAprrovalJobs: j.adminAprrovalJobs ?? "Pending",
    }));

    // -------- respond --------
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



//with flags updation after admin approval only for employer
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

      // keep skills from body; we'll handle below as strings
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
        message: "This job post has been deleted and cannot be updated."
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
    const findByName = (Model, _key, value, extra = {}) =>
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
      return StateCity.findOne({
        state: { $regex: `^${escapeRegex(String(input))}$`, $options: "i" }
      });
    };

    // Helper: find the canonical city string in a state's cities list (case-insensitive)
    const findCanonicalCity = (stateDoc, cityVal) => {
      if (!stateDoc || !Array.isArray(stateDoc.cities)) return null;
      const norm = String(cityVal).trim().toLowerCase();
      return stateDoc.cities.find(c => String(c).toLowerCase() === norm) || null;
    };

    if (hasState) {
      // State explicitly provided — validate, then (optionally) validate city against it
      const stateDoc = await resolveState(state);
      if (!stateDoc) {
        return res.status(400).json({ status: false, message: "Invalid state." });
      }

      if (hasCity) {
        const cityVal = String(city || "").trim();
        const canonical = cityVal ? findCanonicalCity(stateDoc, cityVal) : null;
        if (cityVal && !canonical) {
          return res.status(400).json({
            status: false,
            message: "Invalid city for the selected state.",
            allowedCities: stateDoc.cities || []
          });
        }
        jobPost.city = canonical ?? null; // null if blank city sent
      } else {
        // No city sent with state: keep existing city only if it belongs to the new state
        const canonical = jobPost.city ? findCanonicalCity(stateDoc, jobPost.city) : null;
        jobPost.city = canonical ?? null;
      }
      jobPost.state = stateDoc._id;
    }

    if (!hasState && hasCity) {
      // Only city was sent. Try within existing stored state first; else infer state by city.
      const cityVal = String(city || "").trim();
      if (!cityVal) {
        // Explicit empty city -> clear city, keep state as-is
        jobPost.city = null;
      } else {
        let stateDoc = null;
        let canonical = null;

        // 1) Try current state first (if present)
        if (jobPost.state) {
          const currentStateDoc = await StateCity.findById(jobPost.state);
          canonical = currentStateDoc ? findCanonicalCity(currentStateDoc, cityVal) : null;
          if (canonical) {
            stateDoc = currentStateDoc;
          }
        }

        // 2) If not found in current state, infer by searching all states
        if (!canonical) {
          const matches = await StateCity.find({
            cities: { $elemMatch: { $regex: new RegExp(`^${escapeRegex(cityVal)}$`, "i") } }
          });

          if (!matches || matches.length === 0) {
            return res.status(400).json({
              status: false,
              message: "City not found in any state."
            });
          }

          // pick the first match for smoother UX
          stateDoc = matches[0];
          canonical = findCanonicalCity(stateDoc, cityVal);
        }

        // Update both state and city canonically
        jobPost.state = stateDoc._id;
        jobPost.city  = canonical;
      }
    }

    // ---------- Skills update (array or CSV; store as strings) ----------
    const hasSkills = Object.prototype.hasOwnProperty.call(req.body, "skills");
    if (hasSkills) {
      let list = [];

      if (Array.isArray(skills)) {
        // accept ["Python", " ML , NLP ", "python"]
        list = skills.flatMap(v => String(v).split(","));
      } else if (typeof skills === "string") {
        // accept "Python, ML , NLP"
        list = skills.split(",");
      } else if (skills == null) {
        // explicit null → clear skills
        list = [];
      } else {
        return res.status(400).json({
          status: false,
          message: "Invalid 'skills' format. Provide an array or a comma-separated string."
        });
      }

      // normalize: trim, drop empties, dedupe case-insensitively (preserve first casing)
      list = list.map(s => s.trim()).filter(Boolean);
      const seen = new Set();
      const normalized = [];
      for (const s of list) {
        const k = s.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          normalized.push(s);
        }
      }

      jobPost.skills = normalized; // store as plain strings
    }

    // ---------- Expired Date update (active only; >= today; ignore if invalid) ----------
    let warningMsg = null; // collect non-fatal warnings
    const hasExpiredDate = Object.prototype.hasOwnProperty.call(req.body, "expiredDate");
    if (hasExpiredDate) {
      if (jobPost.status !== "active") {
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
        warningMsg = warningMsg ? `${warningMsg} ${msg}` : msg;
      } else {
        const toBool = (v) => v === true || v === "true" || v === 1 || v === "1";
        const dup = [];
        if (typeof isActive !== "undefined" && jobPost.isActive === toBool(isActive)) dup.push(`isActive is already ${jobPost.isActive}`);
        if (typeof isLatest !== "undefined" && jobPost.isLatest === toBool(isLatest)) dup.push(`isLatest is already ${jobPost.isLatest}`);
        if (typeof isSaved  !== "undefined" && jobPost.isSaved  === toBool(isSaved))  dup.push(`isSaved is already ${jobPost.isSaved}`);
        if (dup.length) {
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
      // .populate("skills", "skill")   // ⛔️ NOT a ref; keep skills as strings
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

      // skills are stored as strings
      skills: Array.isArray(populated.skills) ? populated.skills : [],

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
        message: "This job post has been deleted and cannot be updated."
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
      message: "Job post deleted successfully.",
    
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



//get job details by job post id without token 
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
         .populate({ path: "skills",       select: "skill" })
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
     
 skills: Array.isArray(jobPost.skills)
        ? jobPost.skills.filter(s => typeof s === "string" && s.trim().length > 0)
        : [],

    
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
    ExperienceRange.findOne({
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




       const data = posts.map(p => {
        
       const skills = Array.isArray(p.skills)
    ? p.skills
        .map(s => {
          if (typeof s === "string") return s.trim();     // <- String[]
          if (s && typeof s === "object") return (s.skill || s.name || "").trim(); // safety for legacy
          return "";
        })
        .filter(Boolean)
    : [];

      return {
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

        //  exactly like your getMySkills style (strings only)
        skills,
          adminAprrovalJobs: p.adminAprrovalJobs,

        state:        p.state?.state ?? null,
        city:         p.city ?? null,
        jobTitle:           p.jobTitle ?? null,
        jobDescription:     p.jobDescription ?? null,
        minSalary:          p.minSalary ?? null,
        maxSalary:          p.maxSalary ?? null,
        displayPhoneNumber: p.displayPhoneNumber ?? null,
        displayEmail:       p.displayEmail ?? null,
        hourlyRate:         p.hourlyRate ?? null,
        appliedCandidates:  p.appliedCandidates,
        status:          p.status,
        isAdminApproved: !!p.isAdminApproved,
        isActive:        !!p.isActive,
        isLatest:        !!p.isLatest,
        isSaved:         !!p.isSaved,
        isApplied:       !!p.isApplied,
        expiredDate: p.expiredDate ? new Date(p.expiredDate).toISOString().split("T")[0] : null,
        createdAt:  p.createdAt,
        jobPosted:  daysAgo(p.createdAt)
      };
    });
      

//     const data = posts.map(p => ({
//       _id: p._id,
//       userId:       p.userId?._id ?? null,
//       userPhone:    p.userId?.phoneNumber ?? null,
//       companyId:    p.companyId?._id ?? null,
//       company:      p.companyId?.companyName ?? null,
//       companyImage: p.companyId?.image ?? null,
//       category:     p.category?.name ?? null,
//       industryType: p.industryType?.name ?? null,
//       salaryType:   p.salaryType?.name ?? null,
//       jobType:      p.jobType?.name ?? null,
//       experience:   p.experience?.name ?? null,
//       otherField:   p.otherField?.name ?? null,
//       workingShift: p.workingShift?.name ?? null,
//       jobProfile:   p.jobProfile?.name ?? null,
     
//  skills,


//       state:        p.state?.state ?? null,
//       city:         p.city ?? null,
//       jobTitle:           p.jobTitle ?? null,
//       jobDescription:     p.jobDescription ?? null,
//       skills:             p.skills ?? null,
//       minSalary:          p.minSalary ?? null,
//       maxSalary:          p.maxSalary ?? null,
//       displayPhoneNumber: p.displayPhoneNumber ?? null,
//       displayEmail:       p.displayEmail ?? null,
//       hourlyRate:         p.hourlyRate ?? null,
//        appliedCandidates: p.appliedCandidates,
//       status:          p.status,
//       isAdminApproved: !!p.isAdminApproved,
      
//       isActive:        !!p.isActive,
//       isLatest:        !!p.isLatest,
//       isSaved:         !!p.isSaved,
//       isApplied:       !!p.isApplied,
//       expiredDate: p.expiredDate ? new Date(p.expiredDate).toISOString().split("T")[0] : null,
//       createdAt:  p.createdAt,
//       jobPosted:  daysAgo(p.createdAt)
//     }));

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
        message: "This job post has been deleted and cannot be updated."
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


   
    // ---------- State/City update logic ----------
const hasState = Object.prototype.hasOwnProperty.call(req.body, "state");
const hasCity  = Object.prototype.hasOwnProperty.call(req.body, "city");

const resolveState = async (input) => {
  if (!input) return null;
  if (mongoose.Types.ObjectId.isValid(input)) return StateCity.findById(input);
  return StateCity.findOne({
    state: { $regex: `^${escapeRegex(String(input))}$`, $options: "i" }
  });
};

// helper: canonical city from a state's list (case-insensitive)
const findCanonicalCity = (stateDoc, cityVal) => {
  if (!stateDoc || !Array.isArray(stateDoc.cities)) return null;
  const norm = String(cityVal).trim().toLowerCase();
  return stateDoc.cities.find(c => String(c).toLowerCase() === norm) || null;
};

if (hasState) {
  // explicit state provided
  const stateDoc = await resolveState(state);
  if (!stateDoc) {
    return res.status(400).json({ status: false, message: "Invalid state." });
  }

  if (hasCity) {
    const cityVal = String(city || "").trim();
    const canonical = cityVal ? findCanonicalCity(stateDoc, cityVal) : null;
    if (cityVal && !canonical) {
      return res.status(400).json({
        status: false,
        message: "Invalid city for the selected state.",
        allowedCities: stateDoc.cities || []
      });
    }
    jobPost.city = canonical ?? null; // allow clearing city by sending empty string
  } else {
    // if city kept but doesn't belong to the new state, clear it
    const canonical = jobPost.city ? findCanonicalCity(stateDoc, jobPost.city) : null;
    jobPost.city = canonical ?? null;
  }

  jobPost.state = stateDoc._id;
}

if (!hasState && hasCity) {
  // only city provided
  const cityVal = String(city || "").trim();

  if (!cityVal) {
    // explicit empty clears city; keep state as-is
    jobPost.city = null;
  } else {
    let chosenState = null;
    let canonical = null;

    // 1) try within current stored state first (if any)
    if (jobPost.state) {
      const current = await StateCity.findById(jobPost.state);
      canonical = current ? findCanonicalCity(current, cityVal) : null;
      if (canonical) chosenState = current;
    }

    // 2) otherwise, infer state by searching all states that contain this city
    if (!canonical) {
      const matches = await StateCity.find({
        cities: { $elemMatch: { $regex: new RegExp(`^${escapeRegex(cityVal)}$`, "i") } }
      });

      if (!matches || matches.length === 0) {
        return res.status(400).json({
          status: false,
          message: "City not found in any state."
        });
      }

      // If you prefer strictness, check matches.length > 1 and ask for state.
      chosenState = matches[0];
      canonical = findCanonicalCity(chosenState, cityVal);
    }

    // update both state & city canonically
    jobPost.state = chosenState._id;
    jobPost.city  = canonical;
  }
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
       .populate({ path: "skills", select: "skill -_id" })
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


        skills: Array.isArray(populated.skills)
  ? populated.skills.map(s =>
      (s && typeof s === "object" && "skill" in s) ? s.skill : s
     ).filter(Boolean)  : [],

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





//top 5 categories and its job post in array format without token
exports.getTopCategories = async (req, res) => {
  try {
    const categoryLimit    = Math.max(parseInt(req.query.categoryLimit, 10) || 5, 1);
    const postsPerCategory = Math.max(parseInt(req.query.postsPerCategory, 10) || 6, 1);

    const COL = {
      jobPosts:      JobPost.collection.name,
      categories:    Category.collection.name,
      companies:     CompanyProfile.collection.name,
      salaryTypes:   SalaryType.collection.name,
      jobTypes:      JobType.collection.name,
      experiences:   Experience.collection.name,
      workingShifts: WorkingShift.collection.name,
      jobProfiles:   JobProfile.collection.name,
      states:        StateCity.collection.name,
      skills:        Skill.collection.name,           // ⬅️ add skills collection
    };

    const notDeleted = { isDeleted: { $ne: true } };  // matches false or missing


    const pipeline = [
      { $match: { ...notDeleted, adminAprrovalJobs: "Approved" } },
                
      { $group: { _id: "$category", jobCount: { $sum: 1 } } },
      { $sort: { jobCount: -1 } },
      { $limit: categoryLimit },

      // join the category doc (still exclude deleted categories)
      {
        $lookup: {
          from: COL.categories,
          let: { catId: "$_id" },
          pipeline: [
            { $match: { $expr: { $and: [
              { $eq: ["$_id", "$$catId"] },
              { $ne: ["$isDeleted", true] } 
              
            ] } } },
            { $project: { _id: 1, name: 1 } }
          ],
          as: "cat"
        }
      },
      { $unwind: "$cat" },

      // fetch latest N jobs per category
      {
        $lookup: {
          from: COL.jobPosts,
          let: { catId: "$_id" },
          pipeline: [
            { $match: { $expr: { $and: [
              { $eq: ["$category", "$$catId"] },
               { $ne: ["$isDeleted", true] },        // ✅ not deleted or missing
                { $eq: ["$adminAprrovalJobs", "Approved"] }
            ] } } },
            { $sort: { createdAt: -1 } },
            { $limit: postsPerCategory },

            // lookups for display names
            { $lookup: { from: COL.companies,     localField: "companyId",   foreignField: "_id", as: "company" } },
            { $lookup: { from: COL.salaryTypes,   localField: "salaryType",  foreignField: "_id", as: "salary" } },
            { $lookup: { from: COL.jobTypes,      localField: "jobType",     foreignField: "_id", as: "jt" } },
            { $lookup: { from: COL.experiences,   localField: "experience",  foreignField: "_id", as: "exp" } },
            { $lookup: { from: COL.workingShifts, localField: "workingShift",foreignField: "_id", as: "ws" } },
            { $lookup: { from: COL.jobProfiles,   localField: "jobProfile",  foreignField: "_id", as: "jp" } },
            { $lookup: { from: COL.states,        localField: "state",       foreignField: "_id", as: "st" } },

            // ⬇️ NEW: resolve job skills (return array of skill names)
            {
              $lookup: {
                from: COL.skills,
                let: { ids: "$skills" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $in: ["$_id", "$$ids"] },
                          { $eq: ["$isDeleted", false] }
                        ]
                      }
                    }
                  },
                  { $project: { _id: 0, skill: 1 } }
                ],
                as: "skillDocs"
              }
            },
            {
              $addFields: {
                skills: {
                  $map: { input: "$skillDocs", as: "s", in: "$$s.skill" }
                }
              }
            },

            // flatten readable fields
            {
              $addFields: {
                company:      { $first: "$company.companyName" },
                companyImage: { $first: "$company.image" },
                salaryType:   { $first: "$salary.name" },
                jobType:      { $first: "$jt.name" },
                experience:   { $first: "$exp.name" },
                workingShift: { $first: "$ws.name" },
                jobProfile:   { $first: "$jp.name" },
                state:        { $first: "$st.state" }
              }
            },

            // keep only what you need
            {
              $project: {
                _id: 1,
                jobTitle: 1,
                jobDescription: 1,
                company: 1,
                companyImage: 1,
                salaryType: 1,
                jobType: 1,
                experience: 1,
                workingShift: 1,
                jobProfile: 1,
                state: 1,
                city: 1,
                minSalary: 1,
                maxSalary: 1,
                status: 1,
                expiredDate: 1,
                createdAt: 1,
                skills: 1,                              // ⬅️ include resolved skills
              }
            }
          ],
          as: "jobs"
        }
      },

      {
        $project: {
          _id: 0,
          categoryId: "$cat._id",
          categoryName: "$cat.name",
          jobs: "$jobs"
        }
      }
    ];

    const rows = await JobPost.aggregate(pipeline);

    // rename jobs → job postarray (and add "x days ago")
    const data = rows.map(row => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      "jobPost": (row.jobs || []).map(j => ({
        ...j,
        jobPosted: daysAgo(j.createdAt)
      }))
    }));

    return res.status(200).json({
      status: true,
      message: "Top 5 categories fetched successfully.",
      data
    });
  } catch (err) {
    console.error("getTopCategories error:", err);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch top categories.",
      error: err.message
    });
  }
};



function pickLabel(doc, isState = false) {
  if (!doc) return null;
  if (isState) return doc.state ?? doc.name ?? null;          // StateCity has "state"
  return doc.name ?? doc.title ?? doc.label ?? doc.type ?? doc.range ?? doc.shift ?? null;
}



//get job list based on job seeker skills
const pickLabelOne = (obj, isState = false) =>
  obj ? (obj.label || obj.title || obj.name || (isState ? obj.state : null)) : null;

const formatDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

exports.getBasedOnSkillsJobs = async (req, res) => {
  try {
    const { userId, role } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({ status: false, message: "Only job seekers can view job posts." });
    }

    // 1️⃣ Get seeker’s skills (strings)
    const jss = await JobSeekerSkill.findOne({ userId, isDeleted: false })
      .select("skills")
      .lean();

    const seekerSkills = (jss?.skills || [])
      .map(s => String(s || "").trim())
      .filter(Boolean);

    if (!seekerSkills.length) {
      return res.status(200).json({
        status: true,
        message: "No skills found in your profile.",
        totalRecord: 0,
        totalPage: 0,
        currentPage: 1,
        data: []
      });
    }

    // 2️⃣ Pagination
    const page  = Math.max(parseInt(req.query.page, 10)  || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

    // 3️⃣ Create regexes for skills (case + space insensitive)
    const skillRegexes = seekerSkills.map(s =>
      new RegExp(`^\\s*${escapeRegex(s)}\\s*$`, "i")
    );

    // 4️⃣ Final filter
    const baseFilter = {
      isDeleted: false,
      status: "active",                // only active jobs
      adminAprrovalJobs: "Approved",   // ✅ only admin-approved posts
      skills: { $in: skillRegexes },   // at least one matching skill
    };

    // ---- PASS 1: lightweight fetch for ranking ----
    const minimal = await JobPost
      .find(baseFilter)
      .select("_id skills createdAt")
      .lean();

    if (!minimal.length) {
      return res.status(200).json({
        status: true,
        message: "No matching job posts found.",
        totalRecord: 0,
        totalPage: 0,
        currentPage: page,
        data: []
      });
    }

    // rank by overlap (skill match count)
    const seekerSet = new Set(seekerSkills.map(s => s.toLowerCase()));
    const ranked = minimal
      .map(doc => {
        const arr = (doc.skills || [])
          .map(s => String(s || "").trim().toLowerCase());
        const overlap = arr.reduce((c, s) => c + (seekerSet.has(s) ? 1 : 0), 0);
        return { _id: String(doc._id), createdAt: doc.createdAt, overlap };
      })
      .sort((a, b) => (b.overlap - a.overlap) || (new Date(b.createdAt) - new Date(a.createdAt)));

    const totalRecord = ranked.length;
    const totalPage   = Math.max(Math.ceil(totalRecord / limit), 1);
    const start       = (page - 1) * limit;
    const pageIds     = ranked.slice(start, start + limit).map(r => new mongoose.Types.ObjectId(r._id));
    const orderIndex  = new Map(pageIds.map((id, i) => [String(id), i]));

    // ---- PASS 2: fetch populated docs ----
    const pageDocs = await JobPost.find({ _id: { $in: pageIds } })
      .populate({ path: "companyId",    select: "companyName image" })
      .populate({ path: "category",     select: "name title label" })
      .populate({ path: "industryType", select: "name title label" })
      .populate({ path: "jobType",      select: "name type label title" })
      .populate({ path: "salaryType",   select: "name type label title" })
      .populate({ path: "experience",   select: "name label range" })
      .populate({ path: "workingShift", select: "name label shift" })
      .populate({ path: "otherField",   select: "name label title" })
      .populate({ path: "jobProfile",   select: "name title label" })
      .populate({ path: "state",        select: "state name" })
      .lean();

    // maintain ranked order
    pageDocs.sort((a, b) => orderIndex.get(String(a._id)) - orderIndex.get(String(b._id)));

    // 5️⃣ Response formatting
    const jobPosts = pageDocs.map(job => {
      const {
        companyId, skills, category, industryType, jobType, salaryType,
        experience, workingShift, otherField, jobProfile, state,
        expiredDate, isDeleted, __v, updatedAt, createdAt, ...rest
      } = job;

      return {
        ...rest,
        expiredDate: formatDate(expiredDate),
        companyName:  companyId?.companyName ?? null,
        companyImage: companyId?.image ?? null,
        skills: (skills || []),
        category:     pickLabelOne(category),
        industryType: pickLabelOne(industryType),
        jobType:      pickLabelOne(jobType),
        salaryType:   pickLabelOne(salaryType),
        experience:   pickLabelOne(experience),
        workingShift: pickLabelOne(workingShift),
        otherField:   pickLabelOne(otherField),
        jobProfile:   pickLabelOne(jobProfile),
        state:        pickLabelOne(state, true)
      };
    });

    return res.status(200).json({
      status: true,
      message: "Based on skills job posts where fetched successfully.",
      data: { totalRecord, totalPage, currentPage: page, jobPosts }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};





//job seeker can save the job post
exports.toggleSavedJob = async (req, res) => {
  try {
    const { role, userId } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({ status: false, message: "Only job seekers can save jobs." });
    }

    const { jobPostId } = req.params || {};
    if (!jobPostId || !mongoose.isValidObjectId(jobPostId)) {
      return res.status(400).json({ status: false, message: "Valid jobPostId is required in params." });
    }

   

    // Validate job
    const post = await JobPost.findById(jobPostId).select("status isDeleted adminAprrovalJobs").lean();
    if (!post) {
      return res.status(404).json({ status: false, message: "Job post not found." });
    }
    if (post.isDeleted) {
      return res.status(400).json({ status: false, message: "Cannot save a soft-deleted job post." });
    }
    if (post.status !== "active") {
      return res.status(400).json({ status: false, message: `Cannot save job post while status is '${post.status}'.` });
    }
     if (post.adminAprrovalJobs !== "Approved") {
      return res.status(400).json({ status: false, message: "Cannot save a job post that is not approved by admin." });
    }

    // Upsert → idempotent
    const r = await SavedJob.updateOne(
      { userId, jobPostId },
      { $setOnInsert: { userId, jobPostId } },
      { upsert: true }
    );

    const already = r.matchedCount > 0; // existed
    return res.status(200).json({
      status: true,
      message: already ? "Job already saved." : "Job saved.",
      data: { jobPostId }
    });
  } catch (err) {
    console.error("toggleSavedJob error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};



//get the saved job post list which job seeker has saved
exports.getSeekerSavedJobs = async (req, res) => {
  try {
    const { role, userId } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({ status: false, message: "Only job seekers can view saved jobs." });
    }

    // ---- pagination ----
    const page  = Math.max(parseInt(req.query.page, 10)  || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip  = (page - 1) * limit;

    // by default we show only active & not-deleted jobs
    const jobMatch = { isDeleted: false, status: "active" };

    // ---- exact count of visible rows (respecting jobMatch) ----
    const countAgg = await SavedJob.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $lookup: {
          from: "jobposts",
          localField: "jobPostId",
          foreignField: "_id",
          as: "job"
        }
      },
      { $unwind: "$job" },
      { $match: { "job.isDeleted": false, "job.status": "active" } },
      { $count: "c" }
    ]);
    const totalRecord = countAgg[0]?.c || 0;
    const totalPage   = Math.max(Math.ceil(totalRecord / limit), 1);

    // helpers
    const pickName = (o) => o?.name ?? o?.title ?? o?.label ?? o?.range ?? o?.experience ?? null;
    const formatDDMMYYYY = (d) => {
      if (!d) return null;
      const dt = new Date(d);
      const dd = String(dt.getDate()).padStart(2, "0");
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const yyyy = dt.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    };

    // ---- fetch page of saved jobs + hydrate job details ----
    const rows = await SavedJob.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "jobPostId",
        match: jobMatch,
        select: `
          userId companyId category industryType jobTitle jobDescription salaryType
          displayPhoneNumber displayEmail jobType skills minSalary maxSalary state city
          experience otherField workingShift jobProfile status hourlyRate expiredDate
          isApplied isLatest appliedCandidates isAdminApproved adminRecommended isDeleted
        `,
        populate: [
          { path: "companyId",   select: "companyName image" },
          { path: "category",    select: "name" },
          { path: "industryType",select: "name" },
          { path: "jobType",     select: "name" },
          { path: "skills",      select: "skill" },
          { path: "state",       select: "state name" },
          { path: "workingShift",select: "name title" },
          { path: "otherField",  select: "name title" },
          { path: "experience",  select: "name label range experience title" },
          { path: "salaryType",  select: "name title label" },
           { path: "jobProfile",  select: "name title label profileName" }
        ]
      })
      .lean();

    // ---- shape payload (skip any null jobPostId due to match filter) ----
    const jobPosts = rows
      .filter(r => r.jobPostId) // excludes inactive/soft-deleted
      .map(r => {
        const p = r.jobPostId;
        return {
          _id: p._id,
          userId: p.userId,

          companyName: p.companyId?.companyName ?? null,
          companyImage: p.companyId?.image ?? null,

          category:     pickName(p.category),
          industryType: pickName(p.industryType),
          jobType:      pickName(p.jobType),
          workingShift: pickName(p.workingShift),
          otherField:   pickName(p.otherField),
          experience:   pickName(p.experience),
          jobProfile: pickName(p.jobProfile),

          state:  p.state?.state ?? p.state?.name ?? null,
          city:   p.city,
          skills: Array.isArray(p.skills) ? p.skills.map(s => s?.skill).filter(Boolean) : [],

          jobTitle:        p.jobTitle,
          jobDescription:  p.jobDescription,
          salaryType:      pickName(p.salaryType),
          minSalary:       p.minSalary,
          maxSalary:       p.maxSalary,
          displayPhoneNumber: p.displayPhoneNumber,
          displayEmail:       p.displayEmail,

          
          status:       p.status,
          hourlyRate:   p.hourlyRate,
          expiredDate:  formatDDMMYYYY(p.expiredDate),

          isApplied:         p.isApplied,
          isLatest:          p.isLatest,
          appliedCandidates: p.appliedCandidates,
          isAdminApproved:   p.isAdminApproved,
          adminRecommended:  p.adminRecommended,

          savedAt: formatDDMMYYYY(r.createdAt) // when user saved it
        };
      });

    return res.status(200).json({
      status: true,
      message: "Saved jobs fetched successfully.",
      result: {
        totalRecord,
        totalPage,
        currentPage: page,
        jobPosts
      }
    });
  } catch (err) {
    console.error("getSeekerSavedJobs error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};



//through company id in response i am getting job post list without token
function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateDDMMYYYY(date) {
  if (!date) return null;
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return null; // invalid date
  return `${pad2(dt.getDate())}-${pad2(dt.getMonth() + 1)}-${dt.getFullYear()}`;
}


exports.getJobPostByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;

    // validate id
    if (!mongoose.isValidObjectId(companyId)) {
      return res.status(400).json({ status: false, message: "Invalid companyId." });
    }

    // pagination
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

     // ---- filters
    const { city, jobTitle } = req.query;

    // filter: all non-deleted posts for this company
    const filter = { companyId, isDeleted: false, adminAprrovalJobs: "Approved" };

     // City: exact, case-insensitive
    if (city && city.trim()) {
      filter.city = { $regex: `^${escapeRegex(city.trim())}$`, $options: "i" };
    }


     // Unified search: jobTitle param matches jobTitle OR any skill (contains, case-insensitive)
    if (jobTitle && jobTitle.trim()) {
      const q = escapeRegex(jobTitle.trim());
      filter.$or = [
        { jobTitle: { $regex: q, $options: "i" } },
        { skills:   { $elemMatch: { $regex: q, $options: "i" } } },
      ];
    }

    const totalRecord = await JobPost.countDocuments(filter);

    const posts = await JobPost.find(filter)
      .select(
        "jobTitle jobDescription minSalary maxSalary hourlyRate salaryType jobType experience workingShift jobProfile industryType category state city expiredDate status companyId skills"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit || 0)
      .populate({ path: "companyId",     model: CompanyProfile,  select: "companyName image" })
      .populate({ path: "salaryType",    model: SalaryType,      select: "name" })
      .populate({ path: "jobType",       model: JobType,         select: "name" })
      .populate({ path: "experience",    model: Experience, select: "name" })
      .populate({ path: "workingShift",  model: WorkingShift,    select: "name" })
      .populate({ path: "jobProfile",    model: JobProfile,      select: "name jobProfile" })
      .populate({ path: "industryType",  model: IndustryType,    select: "name" })
      .populate({ path: "category",      model: Category,        select: "name" })
      .populate({ path: "state",         model: StateCity,       select: "state" })
      .lean();

    const data = posts.map(p => ({
      jobPostId: String(p._id),
      jobTitle: p.jobTitle || null,
      jobDescription: p.jobDescription || null,

      companyName:  p.companyId?.companyName || null,
      companyImage: p.companyId?.image || null,

      salaryType:    p.salaryType?.name || null,
      jobType:       p.jobType?.name || null,
      experience:    p.experience?.name || null,
      workingShift:  p.workingShift?.name || null,
      jobProfile:    p.jobProfile ? (p.jobProfile.jobProfile || p.jobProfile.name || null) : null,
      industryType:  p.industryType?.name || null,
      category:      p.category?.name || null,

      state: p.state?.state || null,
      city:  p.city || null,

      minSalary: p.minSalary ?? null,
      maxSalary: p.maxSalary ?? null,
      hourlyRate: p.hourlyRate ?? null,

        skills: Array.isArray(p.skills) ? p.skills.filter(Boolean) : [],

      expiredDate: p.expiredDate ? formatDateDDMMYYYY(p.expiredDate) : null,
      status: p.status || null,
    }));

    const totalPage = limit && totalRecord > 0 ? Math.ceil(totalRecord / limit) : 1;
    const currentPage = limit ? Math.min(page, totalPage || 1) : 1;

    return res.status(200).json({
      status: true,
      message: "Job posts fetched successfully.",
      totalRecord,
      totalPage,
      currentPage,
      data,
    });
  } catch (err) {
    console.error("getJobPostByCompany error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message,
    });
  }
};


//get job list in ascending order when passing in params jobTitle and skills
exports.getJobPostsAscending = async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const filter = { isDeleted: false, 
      status: "active",
     adminAprrovalJobs: "Approved"
     };

    const skillPrefix   = (req.query.skills   || req.query.skill   || "").trim();
    const titlePrefix   = (req.query.jobTitle || "").trim();             // NEW

    // Prefix filter for jobTitle (case-insensitive)  // NEW
    if (titlePrefix) {
      filter.jobTitle = { $regex: "^" + escapeRegex(titlePrefix), $options: "i" };
    }

    // Prefix filter for any skill (case-insensitive)
    if (skillPrefix) {
      filter.skills = { $elemMatch: { $regex: "^" + escapeRegex(skillPrefix), $options: "i" } };
    }

    const posts = await JobPost.find(filter)
      .select([
        "_id","userId","companyId","category","industryType","salaryType","jobType",
        "experience","otherField","workingShift","jobProfile","state","city",
        "jobTitle","jobDescription","skills","minSalary","maxSalary",
        "displayPhoneNumber","displayEmail","hourlyRate","appliedCandidates",
        "status","adminAprrovalJobs","expiredDate","createdAt"
      ].join(" "))
      .populate({ path: "companyId",    select: "companyName image" })
      .populate({ path: "category",     select: "name" })
      .populate({ path: "industryType", select: "name" })
      .populate({ path: "salaryType",   select: "name" })
      .populate({ path: "jobType",      select: "name" })
      .populate({ path: "experience",   select: "name" })
      .populate({ path: "otherField",   select: "name" })
      .populate({ path: "workingShift", select: "name" })
      .populate({ path: "jobProfile",   select: "name" })
      .populate({ path: "state",        select: "state" })
      .lean();

    const lpSkill = skillPrefix.toLowerCase();
    const lpTitle = titlePrefix.toLowerCase();                               // NEW

    const shaped = posts.map(p => {
      const skills = Array.isArray(p.skills)
        ? p.skills.map(s => (typeof s === "string" ? s.trim() : "")).filter(Boolean)
        : [];

      // first matching skill for sort
      const firstSkill = lpSkill
        ? skills
            .filter(s => s.toLowerCase().startsWith(lpSkill))
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))[0] || ""
        : "";

      // normalized title key for sort (only when prefix provided)            // NEW
      const titleKey = lpTitle && p.jobTitle
        ? (p.jobTitle.toLowerCase().startsWith(lpTitle) ? p.jobTitle.toLowerCase() : "")
        : (p.jobTitle || "").toLowerCase();

      return {
        _id: p._id,
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
        skills,
        adminAprrovalJobs: p.adminAprrovalJobs,
        state: p.state?.state ?? null,
        city:  p.city ?? null,
        jobTitle: p.jobTitle ?? null,
        jobDescription: p.jobDescription ?? null,
        minSalary: p.minSalary ?? null,
        maxSalary: p.maxSalary ?? null,
        displayPhoneNumber: p.displayPhoneNumber ?? null,
        displayEmail: p.displayEmail ?? null,
        hourlyRate: p.hourlyRate ?? null,
        appliedCandidates: p.appliedCandidates ?? 0,
        status: p.status,
        expiredDate: p.expiredDate ? new Date(p.expiredDate).toISOString().slice(0,10) : null,
        createdAt: p.createdAt,

        // sort keys (internal)
        _skillKey: firstSkill.toLowerCase(),
        _titleKey: titleKey                                             // NEW
      };
    });

    // Sort priority:
    // 1) if jobTitle prefix provided -> by title prefix (ascending)
    // 2) if skills prefix provided   -> by first matching skill (ascending)
    // 3) fallback: by jobTitle (ascending, case-insensitive)
    shaped.sort((a, b) => {
      if (titlePrefix) {
        const t = a._titleKey.localeCompare(b._titleKey, undefined, { sensitivity: "base" });
        if (t !== 0) return t;
      }
      if (skillPrefix) {
        const s = a._skillKey.localeCompare(b._skillKey, undefined, { sensitivity: "base" });
        if (s !== 0) return s;
      }
      return (a.jobTitle || "").localeCompare(b.jobTitle || "", undefined, { sensitivity: "base" });
    });

    const totalRecord = shaped.length;
    const totalPage   = Math.max(Math.ceil(totalRecord / limit), 1);
    const start = (page - 1) * limit;
    const data = shaped.slice(start, start + limit).map(({ _skillKey, _titleKey, ...rest }) => rest);

    return res.status(200).json({
      status: true,
      message: "Job posts fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
      data
    });
  } catch (err) {
    console.error("getJobPostsAscending error:", err);
    return res.status(500).json({ status: false, message: "Failed to fetch job posts.", error: err?.message || String(err) });
  }
};


//search public jobs


const escapeRegExp = (str = "") =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


exports.searchPublicJobs = async (req, res) => {
  try {
    const rawSearch = (req.query.search || "").trim();
    if (!rawSearch) {
      return res.status(400).json({
        status: false,
        message: "Search term is required."
      });
    }

    const term = escapeRegExp(rawSearch);
    const regex = new RegExp(term, "i");

    // Pagination
    const page = parseInt(req.query.page, 10) > 0 ? parseInt(req.query.page, 10) : 1;
    const limit = parseInt(req.query.limit, 10) > 0 ? parseInt(req.query.limit, 10) : 10;
    const skip = (page - 1) * limit;

    // Find matching companies
    const companies = await CompanyProfile.find({ companyName: regex }).select("_id companyName");
    const companyIds = companies.map(c => c._id);

    // Filter
    const filter = {
      isDeleted: false,
      status: "active",
      adminAprrovalJobs: "Approved",
      isAdminApproved: true,
      $or: [
        { jobTitle: regex },
        { skills: regex },
        { companyId: { $in: companyIds } }
      ]
    };

    // Query
    const [totalRecord, posts] = await Promise.all([
      JobPost.countDocuments(filter),
      JobPost.find(filter)
        .populate({ path: "companyId", select: "companyName" })
        .collation({ locale: "en", strength: 2 })
        .sort({ jobTitle: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const totalPage = limit ? Math.ceil(totalRecord / limit) : 1;
    const currentPage = limit ? Math.min(page, totalPage || 1) : 1;

    // Transform response
    const list = posts.map(p => ({
      jobPostId: p._id.toString(),
      jobTitle: p.jobTitle,
      companyName: p.companyId?.companyName || "",
      skills: p.skills || [],
      minSalary: p.minSalary ?? null,
      maxSalary: p.maxSalary ?? null,
      city: p.city || null,
      expiredDate: p.expiredDate,
      createdAt: p.createdAt
    }));

    // ✅ Final response in payment-style format
    return res.status(200).json({
      status: true,
      message: "Jobs fetched successfully.",
      data: {
        totalRecord,
        totalPage,
        currentPage,
        list
      }
    });
  } catch (err) {
    console.error("searchPublicJobs error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};

//list with alphabet without token
exports.getKeywords = async (req, res) => {
  try {
    const raw = (req.params.text || "").trim();

    if (!raw) {
      return res.status(400).json({
        status: false,
        message: "Please provide a letter or prefix in the URL.",
      });
    }

    const search = raw.toUpperCase();

    // ---------- CASE 1: Single letter ----------
    if (search.length === 1) {
      const doc = await List.findOne({
        letter: search,
        isDeleted: false,
      }).lean();

      if (!doc) {
        return res.status(404).json({
          status: false,
          message: `No keywords found for letter '${search}'.`,
          data: [],
        });
      }

      return res.status(200).json({
        status: true,
        message: "Realted names fetched successfully.",
        data: doc.names,   // ONLY return names[]
      });
    }

    // ---------- CASE 2: Prefix search ----------
    const regex = new RegExp("^" + search, "i");

    const docs = await List.find(
      {
        isDeleted: false,
        names: { $regex: regex },
      },
      { names: 1 }
    ).lean();

    const matchedNames = [];
    docs.forEach((doc) => {
      doc.names
        .filter((name) => regex.test(name))
        .forEach((name) => matchedNames.push(name));
    });

    if (!matchedNames.length) {
      return res.status(200).json({
        status: true,
        message: `No keywords found starting with '${raw}'.`,
        data: [],
      });
    }

    const uniqueSorted = [...new Set(matchedNames)].sort();

    return res.status(200).json({
      status: true,
      message: "Professional keywords fetched successfully.",
      data: uniqueSorted,  // ONLY names[]
    });
  } catch (err) {
    console.error("Error in getKeywords :", err);
    return res.status(500).json({
      status: false,
      message: "Server error while fetching professional keywords.",
    });
  }
};








