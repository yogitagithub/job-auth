const JobApplication = require("../models/JobApplication");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const JobSeekerEducation = require("../models/Education");
const WorkExperience = require("../models/WorkExperience");
const Skill = require("../models/Skills");
const Resume = require("../models/Resume");
const JobPost = require("../models/JobPost");
const JobProfile = require("../models/AdminJobProfile");
const IndustryType = require("../models/AdminIndustry");


const mongoose = require("mongoose");


exports.applyJobs = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { jobPostId } = req.body;

    if (role !== "job_seeker") {
      return res.status(403).json({ status: false, message: "Only job seekers can apply for jobs." });
    }
    if (!jobPostId || !mongoose.isValidObjectId(jobPostId)) {
      return res.status(400).json({ status: false, message: "Valid Job Post ID is required." });
    }

    // 1) Load job post with minimal fields
    const jobPost = await JobPost.findById(jobPostId).select("status isDeleted");
    if (!jobPost) {
      return res.status(404).json({ status: false, message: "Job post not found." });
    }
    if (jobPost.isDeleted) {
      return res.status(410).json({ status: false, message: "This job post has been removed and cannot be applied to." });
    }
    if (jobPost.status !== "active") {
      return res.status(409).json({ status: false, message: `You cannot apply. Job post is ${jobPost.status}.` });
    }

    // 2) Prevent duplicate (any non-withdrawn counts as already applied)
    const existing = await JobApplication.findOne({ userId, jobPostId, status: { $ne: "Withdrawn" } });
    if (existing) {
      return res.status(400).json({ status: false, message: "You have already applied for this job." });
    }

    // 3) Profile prerequisites
    const jobSeekerProfile = await JobSeekerProfile.findOne({ userId });
    if (!jobSeekerProfile) {
      return res.status(400).json({ status: false, message: "Please complete your profile before applying." });
    }

    const [education, experience, skills, resume] = await Promise.all([
      JobSeekerEducation.findOne({ userId }),
      WorkExperience.findOne({ userId }),
      Skill.findOne({ userId }),
      Resume.findOne({ userId }),
    ]);

    const missing = [];
    if (!education)  missing.push("Education");
    if (!experience) missing.push("Experience");
    if (!skills)     missing.push("Skills");
    if (!resume)     missing.push("Resume");
    const humanJoin = (arr) =>
      arr.length <= 1 ? arr.join("") :
      arr.length === 2 ? `${arr[0]} and ${arr[1]}` :
      `${arr.slice(0,-1).join(", ")}, and ${arr[arr.length-1]}`;
    if (missing.length > 0) {
      return res.status(400).json({
        status: false,
        message: `Please complete ${humanJoin(missing)} section${missing.length > 1 ? "s" : ""} before applying.`,
      });
    }

    // 4) Create application
    const application = await JobApplication.create({
      userId,
      jobSeekerId: jobSeekerProfile._id,
      jobPostId,
      educationId: education._id,
      experienceId: experience._id,
      skillsId: skills._id,
      resumeId: resume._id,
      status: "Applied",
    });

    // 5) Increment counter (guard against race and state changes)
    await JobPost.updateOne(
      { _id: jobPostId, isDeleted: false, status: "active" },
      { $inc: { appliedCandidates: 1 } }
    );

    return res.status(201).json({
      status: true,
      message: "Job applied successfully.",
      data: application,
    });
  } catch (error) {
    console.error("Error applying job:", error);
    return res.status(500).json({ status: false, message: "Server error.", error: error.message });
  }
};





exports.withdrawApplication = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { jobApplicationId } = req.body;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can withdraw applications."
      });
    }

    if (!jobApplicationId || !mongoose.isValidObjectId(jobApplicationId)) {
      return res.status(400).json({
        status: false,
        message: "Valid Job Application ID is required."
      });
    }

    // 1) Check if the application exists
    const application = await JobApplication.findById(jobApplicationId).select("userId jobPostId status");
    if (!application) {
      return res.status(404).json({
        status: false,
        message: "Job application not found."
      });
    }

    // 2) Ensure this application belongs to the logged-in user
    if (!application.userId.equals(userId)) {
      return res.status(403).json({
        status: false,
        message: "You cannot withdraw someone else’s application."
      });
    }

    // 3) Ensure application is still active
    if (application.status !== "Applied") {
      return res.status(409).json({
        status: false,
        message: "This application is not active. You can only withdraw an active application."
      });
    }

    // 4) Fetch related job post
    const jobPost = await JobPost.findById(application.jobPostId)
      .select("status isDeleted appliedCandidates");

    if (!jobPost) {
      return res.status(404).json({
        status: false,
        message: "Job post not found."
      });
    }
    if (jobPost.isDeleted) {
      return res.status(410).json({
        status: false,
        message: "This job post has been removed; withdrawal is blocked."
      });
    }
    if (jobPost.status !== "active") {
      return res.status(409).json({
        status: false,
        message: `You cannot withdraw. Job post is ${jobPost.status}.`
      });
    }

    // 5) Update application status
    application.status = "Withdrawn";
    await application.save();

    // 6) Decrement appliedCandidates (if > 0)
    const updatedPost = await JobPost.findOneAndUpdate(
      { _id: jobPost._id, appliedCandidates: { $gt: 0 } },
      { $inc: { appliedCandidates: -1 } },
      { new: true, projection: { appliedCandidates: 1 } }
    );

    return res.status(200).json({
      status: true,
      message: "Application withdrawn successfully.",
      data: {
        applicationId: application._id,
        currentAppliedCandidates: updatedPost?.appliedCandidates ?? jobPost.appliedCandidates
      }
    });
  } catch (error) {
    console.error("withdrawApplication error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: error.message
    });
  }
};



// for employer and admin
exports.getApplicantsForJob = async (req, res) => {
  try {
    const { role, userId } = req.user;
    const { jobPostId } = req.params;

    // ✅ validate id
    if (!jobPostId || !mongoose.isValidObjectId(jobPostId)) {
      return res.status(400).json({ status: false, message: "Valid Job Post ID is required." });
    }

    // ✅ load job post
    const post = await JobPost.findById(jobPostId)
      .select("_id userId companyId isDeleted status appliedCandidates");
    if (!post) return res.status(404).json({ status: false, message: "Job post not found." });
    if (post.isDeleted) {
      return res.status(410).json({ status: false, message: "This job post has been removed." });
    }

    // ✅ access control
    const isOwnerEmployer = role === "employer" && post.userId?.equals(userId);
    if (!(role === "admin" || isOwnerEmployer)) {
      return res.status(403).json({ status: false, message: "You are not allowed to view applicants for this post." });
    }

    // 🔎 query params
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

    // ✅ filter by status
    const statusQuery = (req.query.status || "Applied").trim();
    const statusFilter = statusQuery.toLowerCase() === "all" ? {} : { status: "Applied" };
    const filter = { jobPostId: post._id, ...statusFilter };

    // ✅ fetch applications
    const [totalRecord, applications] = await Promise.all([
      JobApplication.countDocuments(filter),
      JobApplication.find(filter)
        .select("userId jobSeekerId status employerApprovalStatus appliedAt createdAt")
        .populate({
          path: "jobSeekerId",
          match: { isDeleted: false },
          select: [
            "name",
            "phoneNumber",
            "email",
            "state",
            "city",
            "image",
            "jobProfile",
            "dateOfBirth",
            "gender",
            "panCardNumber",
            "address",
            "alternatePhoneNumber",
            "pincode",
            "industryType"
          ].join(" "),
          populate: [
            { path: "state", select: "state" },
            { path: "jobProfile", select: "jobProfile name" },
            { path: "industryType", select: "industryType name" }
          ]
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    // ✅ date formatter INSIDE function
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    };

    const data = applications
      .filter(a => !!a.jobSeekerId)
      .map(a => {
        const p = a.jobSeekerId;
        return {
          applicationId: a._id.toString(),
          status: a.status,
          employerApprovalStatus: a.employerApprovalStatus,

          jobSeekerName: p.name ?? null,
          phoneNumber: p.phoneNumber ?? null,
          email: p.email ?? null,
          dateOfBirth: formatDate(p.dateOfBirth),   // ✅ formatted
          gender: p.gender ?? null,
          panCardNumber: p.panCardNumber ?? null,
          address: p.address ?? null,
          alternatePhoneNumber: p.alternatePhoneNumber ?? null,
          pincode: p.pincode ?? null,
          state: p.state?.state ?? null,
          city: p.city ?? null,
          image: p.image ?? null,
         

           // ✅ safe mapping (works for both jobProfile.jobProfile or jobProfile.name)
          jobProfile: p.jobProfile
            ? p.jobProfile.jobProfile || p.jobProfile.name || null
            : null,

          // ✅ safe mapping (works for both industryType.industryType or industryType.name)
          industryType: p.industryType
            ? p.industryType.industryType || p.industryType.name || null
            : null,

        };
      });

    const totalPage = limit && totalRecord > 0 ? Math.ceil(totalRecord / limit) : 1;
    const currentPage = limit ? Math.min(page, totalPage || 1) : 1;

    return res.status(200).json({
      status: true,
      message: "Applicants fetched successfully.",
      totalRecord,
      totalPage,
      currentPage,
      data
    });
  } catch (err) {
    console.error("getApplicantsForJob error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};



//get full details of job seeker by employer and admin
exports.getApplicantsDetails = async (req, res) => {
  try {
    const { role, userId } = req.user;
    const { jobPostId } = req.params;

    // --- validate ---
    if (!jobPostId || !mongoose.isValidObjectId(jobPostId)) {
      return res.status(400).json({ status: false, message: "Valid Job Post ID is required." });
    }

    // --- job post ---
    const post = await JobPost.findById(jobPostId).select("_id userId isDeleted");
    if (!post) return res.status(404).json({ status: false, message: "Job post not found." });
    if (post.isDeleted) {
      return res.status(410).json({ status: false, message: "This job post has been removed." });
    }

    // --- ACL ---
    if (role === "job_seeker") {
      return res.status(403).json({ status: false, message: "Job seekers are not allowed to view applicants." });
    }
    const isOwnerEmployer = role === "employer" && post.userId?.equals(userId);
    if (!(role === "admin" || isOwnerEmployer)) {
      return res.status(403).json({ status: false, message: "You are not allowed to view applicants for this post." });
    }

    // --- pagination ---
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

    // --- filter ---
    const statusQuery = (req.query.status || "Applied").trim();
    const statusFilter = statusQuery.toLowerCase() === "all" ? {} : { status: "Applied" };
    const filter = { jobPostId: post._id, ...statusFilter };

    // --- fetch applications (+ profile) ---
    const [totalRecord, apps] = await Promise.all([
      JobApplication.countDocuments(filter),
      JobApplication.find(filter)
        .select("jobSeekerId status employerApprovalStatus createdAt")
        .populate({
          path: "jobSeekerId",
          match: { isDeleted: false },
          select:
            "name phoneNumber email state city image jobProfile dateOfBirth gender panCardNumber address alternatePhoneNumber pincode industryType",
          populate: [
            { path: "state", select: "state" },
            { path: "jobProfile", select: "jobProfile name" },
            { path: "industryType", select: "industryType name" }
          ]
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const seekerIds = apps
      .filter(a => a.jobSeekerId)
      .map(a => a.jobSeekerId._id?.toString?.() || a.jobSeekerId.toString());
    const uniqueSeekerIds = [...new Set(seekerIds)];

    // ---------- helpers ----------
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    };
    const bucketBySeeker = (arr) =>
      arr.reduce((m, x) => {
        const k = x.jobSeekerId?.toString?.() || "";
        (m[k] = m[k] || []).push(x);
        return m;
      }, {});

    if (uniqueSeekerIds.length === 0) {
      return res.status(200).json({
        status: true,
        message: "Applicants details fetched successfully.",
        totalRecord,
        totalPage: 1,
        currentPage: 1,
        data: []
      });
    }

    // ---------- batched related fetches ----------
    const [educations, experiences, skills, resumes] = await Promise.all([
      // EDUCATIONS (support minor casing variants you showed)
      JobSeekerEducation.find({ jobSeekerId: { $in: uniqueSeekerIds } })
        .select({
          jobSeekerId: 1, _id: 0,
          degree: 1,
          boardOfUniversity: 1, boardofuniversity: 1,
          sessionFrom: 1, sessionfrom: 1,
          sessionTo: 1, sessionto: 1,
          marks: 1,
          gradeOrPercentage: 1, gradeorPercentage: 1
        })
        .lean(),

      // WORK EXPERIENCE (exact fields per your schema)
      WorkExperience.find({ jobSeekerId: { $in: uniqueSeekerIds } })
        .select("jobSeekerId companyName jobTitle sessionFrom sessionTo roleDescription -_id")
        .lean(),

      // SKILLS (only 'skills')
      Skill.find({ jobSeekerId: { $in: uniqueSeekerIds } })
        .select("jobSeekerId skills -_id")
        .lean(),

      // RESUMES (only 'fileName')
      Resume.find({ jobSeekerId: { $in: uniqueSeekerIds } })
        .select("jobSeekerId fileName -_id")
        .lean()
    ]);

    const eduBySeeker = bucketBySeeker(educations);
    const expBySeeker = bucketBySeeker(experiences);
    const skillBySeeker = bucketBySeeker(skills);
    const resBySeeker = bucketBySeeker(resumes);

    // ---------- normalizers (remove jobSeekerId & format) ----------
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

    // Return exactly what you store: if array -> array; if string -> string
    const normalizeSkill = (s) => ({
      skills: s?.skills ?? (Array.isArray(s) ? s : null)
    });

    const normalizeResume = (r) => ({
      fileName: r.fileName ?? null
    });

    // ---------- build response ----------
    const data = apps
      .filter(a => a.jobSeekerId)
      .map(a => {
        const p = a.jobSeekerId;
        const sid = p._id.toString();

        return {
          applicationId: a._id.toString(),
          status: a.status,
          employerApprovalStatus: a.employerApprovalStatus,

          jobSeekerName: p.name ?? null,
          email: p.email ?? null,
          dateOfBirth: formatDate(p.dateOfBirth),
          jobProfile: p.jobProfile ? (p.jobProfile.jobProfile || p.jobProfile.name || null) : null,
          industryType: p.industryType ? (p.industryType.industryType || p.industryType.name || null) : null,

          educations: (eduBySeeker[sid] || []).map(normalizeEdu),
          experiences: (expBySeeker[sid] || []).map(normalizeExp),
          skills: (skillBySeeker[sid] || []).map(normalizeSkill),
          resumes: (resBySeeker[sid] || []).map(normalizeResume)
        };
      });

    const totalPage = limit && totalRecord > 0 ? Math.ceil(totalRecord / limit) : 1;
    const currentPage = limit ? Math.min(page, totalPage || 1) : 1;

    return res.status(200).json({
      status: true,
      message: "Applicants details fetched successfully.",
      totalRecord,
      totalPage,
      currentPage,
      data
    });
  } catch (err) {
    console.error("getApplicantsDetails error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};






exports.getMyApplications = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view their applications.",
      });
    }

    // --- pagination params (safe & bounded) ---
    const page  = Math.max(parseInt(req.query.page, 10)  || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip  = (page - 1) * limit;

    // optional filters (use if you want to filter by status from query)
    const statusFilter = (req.query.status || "").trim(); // e.g. "pending/accepted/rejected"
    const employerApproval = (req.query.employerApprovalStatus || "").trim(); // e.g. "approved/pending/rejected"

    const filter = { userId };
    if (statusFilter) filter.status = statusFilter;
    if (employerApproval) filter.employerApprovalStatus = employerApproval;

    // ---- count first
    const totalRecord = await JobApplication.countDocuments(filter);
    const totalPage   = Math.max(1, Math.ceil(totalRecord / limit));
    const currentPage = Math.min(page, totalPage);

    // --- helpers (keep inline as before) ---
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
    };

    const daysAgo = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const createdUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const now = new Date();
      const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const diffDays = Math.max(0, Math.floor((todayUTC - createdUTC) / 86400000));
      return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    };

    // --- page fetch
    const applications = await JobApplication.find(filter)
      .select("userId jobPostId status employerApprovalStatus appliedAt createdAt updatedAt")
      .populate({
        path: "jobPostId",
        select: "jobTitle state companyId createdAt",
        populate: [
          { path: "state", select: "state" },
          { path: "companyId", select: "companyName image" }
        ]
      })
      .sort({ createdAt: -1 })     // newest application first
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .lean();

    const data = applications.map((app) => {
      const jp = app.jobPostId;
      return {
        _id: app._id,
        userId: (app.userId?._id || app.userId).toString(),
        jobPostId: jp ? (jp?._id || jp).toString() : null,
        jobTitle: jp?.jobTitle ?? null,
        state: jp?.state?.state ?? null,
        companyName: jp?.companyId?.companyName ?? null,
        companyImage: jp?.companyId?.image ?? null,
        jobPosted: jp ? daysAgo(jp.createdAt) : null,
        status: app.status,
        employerApprovalStatus: app.employerApprovalStatus,
        appliedAt: formatDate(app.appliedAt),
        createdAt: app.createdAt,
        updatedAt: app.updatedAt
      };
    });

    return res.status(200).json({
      status: true,
      message: data.length ? "Applications fetched successfully." : "No applications found.",
      totalRecord,
      totalPage,
      currentPage,
      data
    });
  } catch (error) {
    console.error("Error fetching applications:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};





exports.updateEmployerApprovalStatus = async (req, res) => {
  try {
    const { role, userId } = req.user;
    const { applicationId } = req.params;
    const { employerApprovalStatus } = req.body;

    // 1) auth: only employer or admin
    if (role !== "employer" && role !== "admin") {
      return res.status(403).json({
        status: false,
        message: "Only employers or admins can update approval status.",
      });
    }

    // 2) validate inputs
    if (!applicationId || !mongoose.isValidObjectId(applicationId)) {
      return res.status(400).json({
        status: false,
        message: "Valid Job Application ID is required.",
      });
    }

    const allowed = ["Pending", "Approved", "Rejected"];
    if (!employerApprovalStatus || !allowed.includes(employerApprovalStatus)) {
      return res.status(400).json({
        status: false,
        message: `Invalid approval status. Allowed values: ${allowed.join(", ")}`,
      });
    }

    // 3) load application (need jobPostId to verify ownership)
    const application = await JobApplication.findById(applicationId).select(
      "_id jobPostId employerApprovalStatus"
    );
    if (!application) {
      return res.status(404).json({
        status: false,
        message: "Job application not found.",
      });
    }

    // 4) if employer, ensure they own the job post
    if (role === "employer") {
      const post = await JobPost.findById(application.jobPostId).select("userId");
      if (!post) {
        return res.status(404).json({ status: false, message: "Job post not found." });
      }
      if (!post.userId.equals(userId)) {
        return res.status(403).json({
          status: false,
          message: "You are not allowed to update approval status for this application.",
        });
      }
    }

    // 5) perform update
    const prev = application.employerApprovalStatus;
    application.employerApprovalStatus = employerApprovalStatus;
    await application.save();

    return res.status(200).json({
      status: true,
      message: "Employer approval status updated successfully.",
      data: {
        applicationId: application._id,
        previousStatus: prev,
        currentStatus: application.employerApprovalStatus,
      },
    });
  } catch (err) {
    console.error("updateEmployerApprovalStatus error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message,
    });
  }
};






exports.getApprovedApplicants = async (req, res) => {
  try {
    const { role, userId } = req.user;
    const jobPostId = (req.query.jobPostId || "").trim();

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

    // Build the set of jobPostIds we’re allowed to look at
    let postIds = [];

    if (jobPostId) {
      // validate given post id
      if (!mongoose.isValidObjectId(jobPostId)) {
        return res.status(400).json({ status: false, message: "Valid Job Post ID is required." });
      }

      const post = await JobPost.findById(jobPostId).select("_id userId isDeleted");
      if (!post) return res.status(404).json({ status: false, message: "Job post not found." });
      if (post.isDeleted) {
        return res.status(410).json({ status: false, message: "This job post has been removed." });
      }

      // Access control: admin or the employer who owns this post
      const isOwnerEmployer = role === "employer" && post.userId?.equals(userId);
      if (!(role === "admin" || isOwnerEmployer)) {
        return res.status(403).json({ status: false, message: "You are not allowed to view approved applicants for this post." });
      }
      postIds = [post._id];
    } else {
      // No jobPostId => Admin sees all, Employer sees only their posts
      if (role === "admin") {
        const all = await JobPost.find({ isDeleted: false }).select("_id");
        postIds = all.map(p => p._id);
      } else if (role === "employer") {
        const mine = await JobPost.find({ userId, isDeleted: false }).select("_id");
        postIds = mine.map(p => p._id);
      } else {
        return res.status(403).json({ status: false, message: "Only employers or admins can view approved applicants." });
      }
    }

    // If there are no posts (e.g., employer with no posts), return empty set
    if (postIds.length === 0) {
      return res.status(200).json({
        status: true,
        message: "Approved applicants fetched successfully.",
        totalRecord: 0,
        totalPage: 1,
        currentPage: 1,
        data: []
      });
    }

    // FILTER: only Approved employerApprovalStatus; usually still Applied
    const filter = {
      jobPostId: { $in: postIds },
      employerApprovalStatus: "Approved",
      status: "Applied" // keep only currently active applications
    };

    const [totalRecord, applications] = await Promise.all([
      JobApplication.countDocuments(filter),
      JobApplication.find(filter)
        .select("userId jobSeekerId jobPostId status employerApprovalStatus appliedAt createdAt")
        .populate({
          path: "jobSeekerId",
          match: { isDeleted: false },
          select: [
            "name",
            "phoneNumber",
            "email",
            "state",
            "city",
            "image",
            "jobProfile",
            "dateOfBirth",
            "gender",
            "panCardNumber",
            "address",
            "alternatePhoneNumber",
            "pincode",
            "industryType"
          ].join(" "),
          populate: [
            { path: "state", select: "state" },
            { path: "jobProfile", select: "jobProfile name" },
            { path: "industryType", select: "industryType name" }
          ]
        })
        .populate({ path: "jobPostId", select: "jobTitle status" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    // inline date formatter (DD-MM-YYYY)
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    };

    const data = applications
      .filter(a => !!a.jobSeekerId) // exclude if profile filtered out
      .map(a => {
        const p = a.jobSeekerId;
        return {
          applicationId: a._id.toString(),
          jobPostId: a.jobPostId?._id?.toString() || null,
          jobTitle: a.jobPostId?.jobTitle || null,

          status: a.status, // "Applied"
          employerApprovalStatus: a.employerApprovalStatus, // "Approved"
          appliedAt: formatDate(a.appliedAt),

          // flattened job seeker fields
          jobSeekerName: p.name ?? null,
          phoneNumber: p.phoneNumber ?? null,
          email: p.email ?? null,
          dateOfBirth: formatDate(p.dateOfBirth),
          gender: p.gender ?? null,
          panCardNumber: p.panCardNumber ?? null,
          address: p.address ?? null,
          alternatePhoneNumber: p.alternatePhoneNumber ?? null,
          pincode: p.pincode ?? null,
          state: p.state?.state ?? null,
          city: p.city ?? null,
          image: p.image ?? null,
          jobProfile: p.jobProfile ? (p.jobProfile.jobProfile || p.jobProfile.name || null) : null,
          industryType: p.industryType ? (p.industryType.industryType || p.industryType.name || null) : null
        };
      });

    const totalPage = limit && totalRecord > 0 ? Math.ceil(totalRecord / limit) : 1;
    const currentPage = limit ? Math.min(page, totalPage || 1) : 1;

    return res.status(200).json({
      status: true,
      message: "Approved applicants fetched successfully.",
      totalRecord,
      totalPage,
      currentPage,
      data
    });
  } catch (err) {
    console.error("getApprovedApplicants error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};
