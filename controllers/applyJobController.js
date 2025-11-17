const JobApplication = require("../models/JobApplication");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const JobSeekerEducation = require("../models/Education");
const WorkExperience = require("../models/WorkExperience");
const JobSeekerSkill = require("../models/JobSeekerSkill");
const Resume = require("../models/Resume");
const JobPost = require("../models/JobPost");
const JobProfile = require("../models/AdminJobProfile");
const IndustryType = require("../models/AdminIndustry");
const StateCity = require("../models/StateCity");


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

    // 1) Validate job post
    const jobPost = await JobPost.findById(jobPostId).select("status isDeleted adminAprrovalJobs");
    if (!jobPost) return res.status(404).json({ status: false, message: "Job post not found." });
    if (jobPost.isDeleted) {
      return res.status(410).json({ status: false, message: "This job post has been removed and cannot be applied to." });
    }
    if (jobPost.status !== "active") {
      return res.status(409).json({ status: false, message: `You cannot apply. Job post is ${jobPost.status}.` });
    }

    // ✅ allow only admin-approved jobs
    const isApproved =
      String(jobPost.adminAprrovalJobs || "").trim().toUpperCase() === "APPROVED";
    if (!isApproved) {
      return res.status(409).json({
        status: false,
        message: "You cannot apply. This job post is not approved by admin yet."
      });
    }

    // 2) Profile prerequisites (same as your code)
    const jobSeekerProfile = await JobSeekerProfile.findOne({ userId });
    if (!jobSeekerProfile) {
      return res.status(400).json({ status: false, message: "Please complete your profile before applying." });
    }
    const [education, experience, skills, resume] = await Promise.all([
      JobSeekerEducation.findOne({ userId }),
      WorkExperience.findOne({ userId }),
      JobSeekerSkill.findOne({ userId }),
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
    if (missing.length) {
      return res.status(400).json({
        status: false,
        message: `Please complete ${humanJoin(missing)} section${missing.length > 1 ? "s" : ""} before applying.`,
      });
    }

    // 3) If there is an ACTIVE app → block. If there is a WITHDRAWN app → revive it.
    const existingAny = await JobApplication.findOne({ userId, jobPostId }).select("_id status");
    if (existingAny && existingAny.status === "Applied") {
      return res.status(409).json({ status: false, message: "You have already applied for this job." });
    }

    // 3a) Try to revive a withdrawn application (atomic update)
    if (existingAny && existingAny.status === "Withdrawn") {
      const revived = await JobApplication.findOneAndUpdate(
        { _id: existingAny._id, status: "Withdrawn" },
        {
          $set: {
            status: "Applied",
            employerApprovalStatus: "Pending",
            appliedAt: new Date(),
            jobSeekerId: jobSeekerProfile._id,
            skillsId: skills._id,
            resumeId: resume._id,
          }
        },
        { new: true }
      );

      // Increment post counters only on transition Withdrawn -> Applied
      await JobPost.updateOne(
        { _id: jobPostId, isDeleted: false, status: "active" },
        { $inc: { appliedCandidates: 1, applicationsPending: 1 }, $set: { isApplied: true } }
      );

      return res.status(200).json({
        status: true,
        message: "Application re-activated successfully.",
        data: revived
      });
    }

    // 3b) No prior app → create new
    const application = await JobApplication.create({
      userId,
      jobSeekerId: jobSeekerProfile._id,
      jobPostId,
      skillsId: skills._id,
      resumeId: resume._id,
      status: "Applied",
    });

    await JobPost.updateOne(
      { _id: jobPostId, isDeleted: false, status: "active" },
      { $inc: { appliedCandidates: 1, applicationsPending: 1 }, $set: { isApplied: true } }
    );

    return res.status(201).json({
      status: true,
      message: "Job applied successfully.",
      data: application,
    });

  } catch (error) {
    // If a race causes E11000, report clearly instead of 500
    if (error?.code === 11000) {
      return res.status(409).json({
        status: false,
        message: "You have already applied for this job.",
      });
    }
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

    const decResult = await JobPost.findOneAndUpdate(
  { _id: jobPost._id, appliedCandidates: { $gt: 0 } }, // guard so it never goes below 0
  { $inc: { appliedCandidates: -1 } },
  { new: true, projection: { appliedCandidates: 1, isApplied: 1 } }
);

if (!decResult) {
  return res.status(200).json({
    status: true,
    message: "Application withdrawn successfully.",
    data: {
      applicationId: application._id,
      currentAppliedCandidates: jobPost.appliedCandidates,
      isApplied: jobPost.isApplied
    }
  });
}



// Compute desired isApplied and update only if it changed
const shouldBeApplied = decResult.appliedCandidates > 0;
if (decResult.isApplied !== shouldBeApplied) {
  await JobPost.updateOne(
    { _id: jobPost._id },
    { $set: { isApplied: shouldBeApplied } }
  );
  decResult.isApplied = shouldBeApplied; // reflect in response
}


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

    // ✅ validate jobPostId
    if (!jobPostId || !mongoose.isValidObjectId(jobPostId)) {
      return res
        .status(400)
        .json({ status: false, message: "Valid Job Post ID is required." });
    }

    // ✅ load job post
    const post = await JobPost.findById(jobPostId).select(
      "_id userId companyId isDeleted status appliedCandidates"
    );
    if (!post)
      return res
        .status(404)
        .json({ status: false, message: "Job post not found." });

    if (post.isDeleted) {
      return res
        .status(410)
        .json({ status: false, message: "This job post has been removed." });
    }

    // ✅ access control
    const isOwnerEmployer = role === "employer" && post.userId?.equals(userId);
    if (!(role === "admin" || isOwnerEmployer)) {
      return res.status(403).json({
        status: false,
        message:
          "You are not allowed to view applicants for this job post.",
      });
    }

    // 🔎 pagination setup
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

    // ✅ filter by status and exclude "Disconnected"
    const statusQuery = (req.query.status || "Applied").trim();
    const statusFilter =
      statusQuery.toLowerCase() === "all" ? {} : { status: "Applied" };

    const filter = {
      jobPostId: post._id,
      ...statusFilter,
      employerApprovalStatus: { $ne: "Disconnected" }, // 🚫 exclude disconnected
    };

    // ✅ fetch applications
    const [totalRecord, applications] = await Promise.all([
      JobApplication.countDocuments(filter),
      JobApplication.find(filter)
        .select(
          "userId jobSeekerId status employerApprovalStatus appliedAt createdAt"
        )
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
            "industryType",
          ].join(" "),
          populate: [
            { path: "state", select: "state" },
            { path: "jobProfile", select: "jobProfile name" },
            { path: "industryType", select: "industryType name" },
          ],
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    // ✅ date formatter
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    };

    // ✅ map response
    const data = applications
      .filter((a) => !!a.jobSeekerId)
      .map((a) => {
        const p = a.jobSeekerId;
        return {
          applicationId: a._id.toString(),
          status: a.status,
          employerApprovalStatus: a.employerApprovalStatus, // ✅ keep in response
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
          jobProfile: p.jobProfile
            ? p.jobProfile.jobProfile || p.jobProfile.name || null
            : null,
          industryType: p.industryType
            ? p.industryType.industryType || p.industryType.name || null
            : null,
        };
      });

    const totalPage =
      limit && totalRecord > 0 ? Math.ceil(totalRecord / limit) : 1;
    const currentPage = limit ? Math.min(page, totalPage || 1) : 1;

    // ✅ send response
    return res.status(200).json({
      status: true,
      message: "Applicants fetched successfully.",
      totalRecord,
      totalPage,
      currentPage,
      data,
    });
  } catch (err) {
    console.error("getApplicantsForJob error:", err);
    return res
      .status(500)
      .json({ status: false, message: "Server error", error: err.message });
  }
};

function escapeRegExp(s = "") {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

exports.getApplicantsForEmployer = async (req, res) => {
  try {
    const { role, userId } = req.user;

    // only employers
    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can view applicants from this endpoint."
      });
    }

    // ---------------- pagination ----------------
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

    // ---------------- status filter ----------------
    const statusQuery = (req.query.status || "Applied").trim();
    const statusFilter =
      statusQuery.toLowerCase() === "all" ? {} : { status: "Applied" };

    // ---------------- employer posts ----------------
    const employerPosts = await JobPost.find({
      userId,
      isDeleted: false
    }).select("_id");

    if (!employerPosts.length) {
      return res.status(200).json({
        status: true,
        message: "Applicants fetched successfully.",
        totalRecord: 0,
        totalPage: 1,
        currentPage: 1,
        data: []
      });
    }
    const jobPostIds = employerPosts.map(p => p._id);

    // ---------------- filters from Postman (BY NAME) ----------------
    const industryTypeName = (req.query.industryType || "").trim();
    const stateName        = (req.query.state || "").trim();
    const cityName         = (req.query.city || "").trim();
    const jobProfileName   = (req.query.jobProfile || "").trim();
    const jobSeekerName    = (req.query.jobSeekerName || "").trim();

    const [
      industryDoc,
      jobProfileDoc,
      stateDoc
    ] = await Promise.all([
      industryTypeName
        ? IndustryType.findOne({
            name: { $regex: `^${escapeRegExp(industryTypeName)}$`, $options: "i" },
            isDeleted: false
          }).select("_id")
        : null,
      jobProfileName
        ? JobProfile.findOne({
            $or: [
              { name:       { $regex: `^${escapeRegExp(jobProfileName)}$`, $options: "i" } },
              { jobProfile: { $regex: `^${escapeRegExp(jobProfileName)}$`, $options: "i" } }
            ]
          }).select("_id")
        : null,
      stateName
        ? StateCity.findOne({
            state: { $regex: `^${escapeRegExp(stateName)}$`, $options: "i" }
          }).select("_id state")
        : null
    ]);

    // If specific name provided but not found => empty result
    if (industryTypeName && !industryDoc) {
      return res.status(200).json({
        status: true,
        message: "Applicants fetched successfully.",
        totalRecord: 0, totalPage: 1, currentPage: 1, data: []
      });
    }
    if (jobProfileName && !jobProfileDoc) {
      return res.status(200).json({
        status: true,
        message: "Applicants fetched successfully.",
        totalRecord: 0, totalPage: 1, currentPage: 1, data: []
      });
    }
    if (stateName && !stateDoc) {
      return res.status(200).json({
        status: true,
        message: "Applicants fetched successfully.",
        totalRecord: 0, totalPage: 1, currentPage: 1, data: []
      });
    }

    // Build seeker profile filter
    const seekerFilter = { isDeleted: false };
    if (industryDoc) seekerFilter.industryType = industryDoc._id;
    if (jobProfileDoc) seekerFilter.jobProfile = jobProfileDoc._id;
    if (stateDoc) seekerFilter.state = stateDoc._id;
    if (cityName)
      seekerFilter.city = { $regex: `^${escapeRegExp(cityName)}$`, $options: "i" };
    if (jobSeekerName)
      seekerFilter.name = { $regex: escapeRegExp(jobSeekerName), $options: "i" };

    let seekerIds = null;
    const anySeekerFilter =
      industryDoc || jobProfileDoc || stateDoc || !!cityName || !!jobSeekerName;

    if (anySeekerFilter) {
      seekerIds = await JobSeekerProfile.find(seekerFilter).distinct("_id");
      if (!seekerIds.length) {
        return res.status(200).json({
          status: true,
          message: "Applicants fetched successfully.",
          totalRecord: 0, totalPage: 1, currentPage: 1, data: []
        });
      }
    }

    // ---------------- final application filter ----------------
    const filter = {
      jobPostId: { $in: jobPostIds },
      ...statusFilter,
      employerApprovalStatus: "Pending", // 🚫 exclude disconnected
      ...(seekerIds ? { jobSeekerId: { $in: seekerIds } } : {})
    };

    // ---------------- query + populate ----------------
    const [totalRecord, applications] = await Promise.all([
      JobApplication.countDocuments(filter),
      JobApplication.find(filter)
        .select(
          "jobPostId userId jobSeekerId status employerApprovalStatus appliedAt createdAt"
        )
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
            { path: "jobProfile", select: "name jobProfile" },
            { path: "industryType", select: "name" }
          ]
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    // ---------------- formatting (dd-mm-yyyy) ----------------
    const pad2 = (n) => String(n).padStart(2, "0");
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const day = pad2(d.getDate());
      const month = pad2(d.getMonth() + 1);
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    };

    const data = applications
      .filter(a => !!a.jobSeekerId)
      .map(a => {
        const p = a.jobSeekerId;
        return {
          jobPostId: a.jobPostId?.toString() || null,
          applicationId: a._id.toString(),
          status: a.status,
          employerApprovalStatus: a.employerApprovalStatus, // ✅ still visible

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

          jobProfile: p.jobProfile
            ? p.jobProfile.jobProfile || p.jobProfile.name || null
            : null,

          industryType: p.industryType
            ? p.industryType.name || null
            : null
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
    console.error("getApplicantsForEmployer error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};


// exports.getApplicantsForEmployer = async (req, res) => {
//   try {
//     const { role, userId } = req.user;

//     // only employers
//     if (role !== "employer") {
//       return res.status(403).json({
//         status: false,
//         message: "Only employers can view applicants from this endpoint."
//       });
//     }

//     // ---------------- pagination ----------------
//     const pageParam = parseInt(req.query.page, 10);
//     const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

//     const limitRaw = (req.query.limit || "").toString().toLowerCase();
//     const limit =
//       limitRaw === "all"
//         ? 0
//         : (() => {
//             const n = parseInt(limitRaw || "10", 10);
//             if (!Number.isFinite(n) || n < 1) return 10;
//             return Math.min(n, 100);
//           })();
//     const skip = limit ? (page - 1) * limit : 0;

//     // ---------------- status filter ----------------
//     const statusQuery = (req.query.status || "Applied").trim();
//     const statusFilter =
//       statusQuery.toLowerCase() === "all" ? {} : { status: "Applied" };

//     // ---------------- employer posts ----------------
//     const employerPosts = await JobPost.find({
//       userId,
//       isDeleted: false
//     }).select("_id");

//     if (!employerPosts.length) {
//       return res.status(200).json({
//         status: true,
//         message: "Applicants fetched successfully.",
//         totalRecord: 0,
//         totalPage: 1,
//         currentPage: 1,
//         data: []
//       });
//     }
//     const jobPostIds = employerPosts.map(p => p._id);

//     // ---------------- filters from Postman (BY NAME) ----------------
//     const industryTypeName = (req.query.industryType || "").trim();
//     const stateName        = (req.query.state || "").trim();
//     const cityName         = (req.query.city || "").trim();
//     const jobProfileName   = (req.query.jobProfile || "").trim();
//     const jobSeekerName    = (req.query.jobSeekerName || "").trim();

//     const [
//       industryDoc,
//       jobProfileDoc,
//       stateDoc
//     ] = await Promise.all([
//       industryTypeName
//         ? IndustryType.findOne({
//             name: { $regex: `^${escapeRegExp(industryTypeName)}$`, $options: "i" },
//             isDeleted: false
//           }).select("_id")
//         : null,
//       jobProfileName
//         ? JobProfile.findOne({
//             $or: [
//               { name:       { $regex: `^${escapeRegExp(jobProfileName)}$`, $options: "i" } },
//               { jobProfile: { $regex: `^${escapeRegExp(jobProfileName)}$`, $options: "i" } }
//             ]
//           }).select("_id")
//         : null,
//       stateName
//         ? StateCity.findOne({
//             state: { $regex: `^${escapeRegExp(stateName)}$`, $options: "i" }
//           }).select("_id state")
//         : null
//     ]);

//     // If specific name provided but not found => empty result
//     if (industryTypeName && !industryDoc) {
//       return res.status(200).json({
//         status: true,
//         message: "Applicants fetched successfully.",
//         totalRecord: 0, totalPage: 1, currentPage: 1, data: []
//       });
//     }
//     if (jobProfileName && !jobProfileDoc) {
//       return res.status(200).json({
//         status: true,
//         message: "Applicants fetched successfully.",
//         totalRecord: 0, totalPage: 1, currentPage: 1, data: []
//       });
//     }
//     if (stateName && !stateDoc) {
//       return res.status(200).json({
//         status: true,
//         message: "Applicants fetched successfully.",
//         totalRecord: 0, totalPage: 1, currentPage: 1, data: []
//       });
//     }

//     // Build seeker profile filter
//     const seekerFilter = { isDeleted: false };
//     if (industryDoc) seekerFilter.industryType = industryDoc._id;
//     if (jobProfileDoc) seekerFilter.jobProfile = jobProfileDoc._id;
//     if (stateDoc) seekerFilter.state = stateDoc._id;
//     if (cityName)
//       seekerFilter.city = { $regex: `^${escapeRegExp(cityName)}$`, $options: "i" };
//     if (jobSeekerName)
//       seekerFilter.name = { $regex: escapeRegExp(jobSeekerName), $options: "i" };

//     let seekerIds = null;
//     const anySeekerFilter =
//       industryDoc || jobProfileDoc || stateDoc || !!cityName || !!jobSeekerName;

//     if (anySeekerFilter) {
//       seekerIds = await JobSeekerProfile.find(seekerFilter).distinct("_id");
//       if (!seekerIds.length) {
//         return res.status(200).json({
//           status: true,
//           message: "Applicants fetched successfully.",
//           totalRecord: 0, totalPage: 1, currentPage: 1, data: []
//         });
//       }
//     }

//     // ---------------- final application filter ----------------
//     const filter = {
//       jobPostId: { $in: jobPostIds },
//       ...statusFilter,
//       employerApprovalStatus: { $ne: "Disconnected" }, // 🚫 exclude disconnected
//       ...(seekerIds ? { jobSeekerId: { $in: seekerIds } } : {})
//     };

//     // ---------------- query + populate ----------------
//     const [totalRecord, applications] = await Promise.all([
//       JobApplication.countDocuments(filter),
//       JobApplication.find(filter)
//         .select(
//           "jobPostId userId jobSeekerId status employerApprovalStatus appliedAt createdAt"
//         )
//         .populate({
//           path: "jobSeekerId",
//           match: { isDeleted: false },
//           select: [
//             "name",
//             "phoneNumber",
//             "email",
//             "state",
//             "city",
//             "image",
//             "jobProfile",
//             "dateOfBirth",
//             "gender",
//             "panCardNumber",
//             "address",
//             "alternatePhoneNumber",
//             "pincode",
//             "industryType"
//           ].join(" "),
//           populate: [
//             { path: "state", select: "state" },
//             { path: "jobProfile", select: "name jobProfile" },
//             { path: "industryType", select: "name" }
//           ]
//         })
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(limit)
//         .lean()
//     ]);

//     // ---------------- formatting (dd-mm-yyyy) ----------------
//     const pad2 = (n) => String(n).padStart(2, "0");
//     const formatDate = (date) => {
//       if (!date) return null;
//       const d = new Date(date);
//       const day = pad2(d.getDate());
//       const month = pad2(d.getMonth() + 1);
//       const year = d.getFullYear();
//       return `${day}-${month}-${year}`;
//     };

//     const data = applications
//       .filter(a => !!a.jobSeekerId)
//       .map(a => {
//         const p = a.jobSeekerId;
//         return {
//           jobPostId: a.jobPostId?.toString() || null,
//           applicationId: a._id.toString(),
//           status: a.status,
//           employerApprovalStatus: a.employerApprovalStatus, // ✅ still visible

//           jobSeekerName: p.name ?? null,
//           phoneNumber: p.phoneNumber ?? null,
//           email: p.email ?? null,
//           dateOfBirth: formatDate(p.dateOfBirth),
//           gender: p.gender ?? null,
//           panCardNumber: p.panCardNumber ?? null,
//           address: p.address ?? null,
//           alternatePhoneNumber: p.alternatePhoneNumber ?? null,
//           pincode: p.pincode ?? null,
//           state: p.state?.state ?? null,
//           city: p.city ?? null,
//           image: p.image ?? null,

//           jobProfile: p.jobProfile
//             ? p.jobProfile.jobProfile || p.jobProfile.name || null
//             : null,

//           industryType: p.industryType
//             ? p.industryType.name || null
//             : null
//         };
//       });

//     const totalPage = limit && totalRecord > 0 ? Math.ceil(totalRecord / limit) : 1;
//     const currentPage = limit ? Math.min(page, totalPage || 1) : 1;

//     return res.status(200).json({
//       status: true,
//       message: "Applicants fetched successfully.",
//       totalRecord,
//       totalPage,
//       currentPage,
//       data
//     });
//   } catch (err) {
//     console.error("getApplicantsForEmployer error:", err);
//     return res.status(500).json({
//       status: false,
//       message: "Server error",
//       error: err.message
//     });
//   }
// };



exports.getApplicantsDetails = async (req, res) => {
  try {
    const { role, userId } = req.user;
    const { jobPostId } = req.params;

    // --- validate ---
    if (!jobPostId || !mongoose.isValidObjectId(jobPostId)) {
      return res.status(400).json({
        status: false,
        message: "Valid Job Post ID is required.",
      });
    }

    // --- job post ---
    const post = await JobPost.findById(jobPostId).select("_id userId isDeleted");
    if (!post) {
      return res
        .status(404)
        .json({ status: false, message: "Job post not found." });
    }
    if (post.isDeleted) {
      return res
        .status(410)
        .json({ status: false, message: "This job post has been removed." });
    }

    // --- ACL ---
    if (role === "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Job seekers are not allowed to view applicants.",
      });
    }
    const isOwnerEmployer = role === "employer" && post.userId?.equals(userId);
    if (!(role === "admin" || isOwnerEmployer)) {
      return res.status(403).json({
        status: false,
        message: "You are not allowed to view applicants for this post.",
      });
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

    // --- filter (exclude disconnected) ---
    const statusQuery = (req.query.status || "Applied").trim();
    const statusFilter =
      statusQuery.toLowerCase() === "all" ? {} : { status: "Applied" };

    const filter = {
      jobPostId: post._id,
      ...statusFilter,
      employerApprovalStatus: { $ne: "Disconnected" }, // 🚫 exclude disconnected
    };

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
            { path: "industryType", select: "industryType name" },
          ],
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const seekerIds = apps
      .filter((a) => a.jobSeekerId)
      .map((a) => a.jobSeekerId._id?.toString?.() || a.jobSeekerId.toString());
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
        data: [],
      });
    }

    // ---------- batched related fetches ----------
    const [educations, experiences, jsSkills, resumes] = await Promise.all([
      JobSeekerEducation.find({ jobSeekerId: { $in: uniqueSeekerIds } })
        .select({
          jobSeekerId: 1,
          _id: 0,
          degree: 1,
          boardOfUniversity: 1,
          boardofuniversity: 1,
          sessionFrom: 1,
          sessionfrom: 1,
          sessionTo: 1,
          sessionto: 1,
          marks: 1,
          gradeOrPercentage: 1,
          gradeorPercentage: 1,
        })
        .lean(),

      WorkExperience.find({ jobSeekerId: { $in: uniqueSeekerIds } })
        .select(
          "jobSeekerId companyName jobTitle sessionFrom sessionTo roleDescription -_id"
        )
        .lean(),

      JobSeekerSkill.find({
        jobSeekerId: { $in: uniqueSeekerIds },
        isDeleted: false,
      })
        .select("jobSeekerId skillIds -_id")
        .populate({ path: "skillIds", select: "skill" })
        .lean(),

      Resume.find({ jobSeekerId: { $in: uniqueSeekerIds } })
        .select("jobSeekerId fileName -_id")
        .lean(),
    ]);

    const eduBySeeker = bucketBySeeker(educations);
    const expBySeeker = bucketBySeeker(experiences);

    const skillsBySeeker = jsSkills.reduce((acc, doc) => {
      const sid = doc.jobSeekerId.toString();
      const names = (doc.skillIds || [])
        .map((s) =>
          s && typeof s === "object" && "skill" in s ? s.skill : s
        )
        .filter(Boolean);
      acc[sid] = Array.from(new Set([...(acc[sid] || []), ...names]));
      return acc;
    }, {});

    const resBySeeker = bucketBySeeker(resumes);

    // ---------- normalizers ----------
    const normalizeEdu = (e) => ({
      degree: e.degree ?? null,
      boardOfUniversity: e.boardOfUniversity ?? e.boardofuniversity ?? null,
      sessionFrom: formatDate(e.sessionFrom ?? e.sessionfrom),
      sessionTo: formatDate(e.sessionTo ?? e.sessionto),
      marks: e.marks ?? null,
      gradeOrPercentage: e.gradeOrPercentage ?? e.gradeorPercentage ?? null,
    });

    const normalizeExp = (x) => ({
      companyName: x.companyName ?? null,
      jobTitle: x.jobTitle ?? null,
      sessionFrom: formatDate(x.sessionFrom),
      sessionTo: formatDate(x.sessionTo),
      roleDescription: x.roleDescription ?? null,
    });

    const normalizeResume = (r) => ({ fileName: r.fileName ?? null });

    // ---------- build response ----------
    const data = apps
      .filter((a) => a.jobSeekerId)
      .map((a) => {
        const p = a.jobSeekerId;
        const sid = p._id.toString();

        return {
          applicationId: a._id.toString(),
          status: a.status,
          employerApprovalStatus: a.employerApprovalStatus, // ✅ still visible
          jobSeekerName: p.name ?? null,
          email: p.email ?? null,
          dateOfBirth: formatDate(p.dateOfBirth),
          jobProfile: p.jobProfile
            ? p.jobProfile.jobProfile || p.jobProfile.name || null
            : null,
          industryType: p.industryType
            ? p.industryType.industryType || p.industryType.name || null
            : null,
          educations: (eduBySeeker[sid] || []).map(normalizeEdu),
          experiences: (expBySeeker[sid] || []).map(normalizeExp),
          skills: skillsBySeeker[sid] || [],
          resumes: (resBySeeker[sid] || []).map(normalizeResume),
        };
      });

    const totalPage =
      limit && totalRecord > 0 ? Math.ceil(totalRecord / limit) : 1;
    const currentPage = limit ? Math.min(page, totalPage || 1) : 1;

    return res.status(200).json({
      status: true,
      message: "Applicants details fetched successfully.",
      totalRecord,
      totalPage,
      currentPage,
      data,
    });
  } catch (err) {
    console.error("getApplicantsDetails error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message,
    });
  }
};

exports.getSeekerApplicantDetails = async (req, res) => {
  try {
    const { role, userId } = req.user || {};
      const { jobSeekerId } = req.params || {}; 

    // ---- ACL ----
    if (!(role === "employer" || role === "admin")) {
      return res.status(403).json({ status: false, message: "Only employers can view seeker details." });
    }

    // ---- validate ----
    if (!jobSeekerId || !mongoose.isValidObjectId(jobSeekerId)) {
      return res.status(400).json({ status: false, message: "Valid jobSeekerId is required in body." });
    }

    // ---- employer's active posts ----
    const employerPosts = await JobPost.find({ userId, isDeleted: false }).select("_id").lean();
    if (role === "employer" && employerPosts.length === 0) {
      return res.status(403).json({ status: false, message: "You have no active job posts." });
    }
    const employerPostIds = employerPosts.map(p => p._id);

    // ---- gate: must have an ACTIVE (non-rejected) app to ANY employer post ----
    const gateFilter = {
      jobSeekerId: mongoose.Types.ObjectId.createFromHexString(jobSeekerId),
      status: "Applied",
      employerApprovalStatus: { $ne: "Rejected" },
      isDeleted: { $ne: true } // harmless if field absent
    };
    if (role === "employer") gateFilter.jobPostId = { $in: employerPostIds };

    const hasActive = await JobApplication.exists(gateFilter);
    if (!hasActive) {
      return res.status(403).json({
        status: false,
        message:
          role === "admin"
            ? "No active (non-rejected) application found for this job seeker."
            : "This candidate has no active (non-rejected) application to your job posts."
      });
    }

    // ---- seeker profile (must be active) ----
    const seeker = await JobSeekerProfile.findById(jobSeekerId)
      .select("name phoneNumber email state city image jobProfile dateOfBirth gender panCardNumber address alternatePhoneNumber pincode industryType isDeleted")
      .populate([
        { path: "state", select: "state" },
        { path: "jobProfile", select: "jobProfile name" },
        { path: "industryType", select: "industryType name" }
      ])
      .lean();

    if (!seeker) return res.status(404).json({ status: false, message: "Job seeker not found." });
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
      WorkExperience.find({ jobSeekerId }).select("jobSeekerId companyName jobTitle sessionFrom sessionTo roleDescription -_id").lean(),
      JobSeekerSkill.find({ jobSeekerId, isDeleted: false })
        .select("jobSeekerId skillIds -_id")
        .populate({ path: "skillIds", select: "skill" })
        .lean(),
      Resume.find({ jobSeekerId }).select("jobSeekerId fileName -_id").lean()
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
    const skills = jsSkills.reduce((acc, doc) => {
      const names = (doc.skillIds || [])
        .map(s => (s && typeof s === "object" && "skill" in s) ? s.skill : s)
        .filter(Boolean);
      return Array.from(new Set([...(acc || []), ...names]));
    }, []);
    const normalizeResume = (r) => ({ fileName: r.fileName ?? null });

    // ---- response (no latestApplication / appliedToJobPostIds) ----
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
      jobProfile: seeker.jobProfile ? (seeker.jobProfile.jobProfile || seeker.jobProfile.name || null) : null,
      industryType: seeker.industryType ? (seeker.industryType.industryType || seeker.industryType.name || null) : null,
      educations: educations.map(normalizeEdu),
      experiences: experiences.map(normalizeExp),
      skills,
      resumes: resumes.map(normalizeResume)
    };

    return res.status(200).json({ status: true, message: "Job seeker details fetched successfully.", data });
  } catch (err) {
    console.error("getSeekerApplicantDetails error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};



const formatDateUTC = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return `${String(d.getUTCDate()).padStart(2,"0")}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${d.getUTCFullYear()}`;
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
           select: [
         "jobTitle","state","city","category","industryType","jobDescription","salaryType",
          "displayPhoneNumber","displayEmail","jobType","minSalary","maxSalary","companyId",
          "experience","otherField","workingShift","jobProfile", "hourlyRate","expiredDate",
          "createdAt"
        ].join(" "),
        // select: "jobTitle state companyId createdAt",
        populate: [
          { path: "state", select: "state" },
          { path: "companyId", select: "companyName image" },
            { path: "state",        select: "state" },                      // StateCity { state }
          { path: "category",     select: "categoryName name" },          // Category { categoryName } or { name }
          { path: "industryType", select: "industryType name" },          // IndustryType { industryType } or { name }
          { path: "salaryType",   select: "salaryType name" },            // SalaryType { salaryType } or { name }
          { path: "jobType",      select: "jobType type name" },          // JobType { jobType } or { type/name }
          { path: "companyId",    select: "companyName image" },


            { path: "experience",   select: "range label name" },
          { path: "otherField",   select: "name label otherField" },
          { path: "workingShift", select: "name shift workingShift" },
          { path: "jobProfile",   select: "name jobProfile" },
          
        ]
      })

      .sort({ createdAt: -1 })     // newest application first
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .lean();

    const data = applications.map((app) => {
      const jp = app.jobPostId;


       // resolve names with safe fallbacks to support different schema naming
      const categoryName     = jp?.category?.categoryName ?? jp?.category?.name ?? null;
      const industryTypeName = jp?.industryType?.industryType ?? jp?.industryType?.name ?? null;
      const salaryTypeName   = jp?.salaryType?.salaryType ?? jp?.salaryType?.name ?? null;
      const jobTypeName      = jp?.jobType?.jobType ?? jp?.jobType?.type ?? jp?.jobType?.name ?? null;

    
      const experienceName   = jp?.experience?.range ?? jp?.experience?.label ?? jp?.experience?.name ?? null;
      const otherFieldName   = jp?.otherField?.name ?? jp?.otherField?.label ?? jp?.otherField?.otherField ?? null;
      const workingShiftName = jp?.workingShift?.name ?? jp?.workingShift?.shift ?? jp?.workingShift?.workingShift ?? null;
      const jobProfileName   = jp?.jobProfile?.name ?? jp?.jobProfile?.jobProfile ?? null;


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
        updatedAt: app.updatedAt,

        
        city: jp?.city ?? null,
        category: categoryName,
        industryType: industryTypeName,
        jobDescription: jp?.jobDescription ?? null,
        salaryType: salaryTypeName,
        displayPhoneNumber: jp?.displayPhoneNumber ?? null,
        displayEmail: jp?.displayEmail ?? null,
        jobType: jobTypeName,

          minSalary: jp?.minSalary ?? null,   // ← NEW
        maxSalary: jp?.maxSalary ?? null,   // ← NEW


          experience:   experienceName,
        otherField:   otherFieldName,
        workingShift: workingShiftName,
        jobProfile:   jobProfileName,
        hourlyRate:   jp?.hourlyRate ?? null,
       expiredDate:  formatDateUTC(jp?.expiredDate),
        
       
       
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
    const { applicationId, employerApprovalStatus, hourlyRate } = req.body;

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

    const allowed = ["Pending", "Approved", "Rejected", "Disconnected"];
    if (!employerApprovalStatus || !allowed.includes(employerApprovalStatus)) {
      return res.status(400).json({
        status: false,
        message: `Invalid approval status. Allowed values: ${allowed.join(", ")}`,
      });
    }

    // ✅ Extra validation based on status
    let numericHourlyRate = null;

    if (employerApprovalStatus === "Approved") {
      // hourlyRate is REQUIRED and must be a positive number
      if (
        hourlyRate === undefined ||
        hourlyRate === null ||
        String(hourlyRate).trim() === ""
      ) {
        return res.status(400).json({
          status: false,
          message: "hourlyRate is required when approval status is Approved.",
        });
      }

      numericHourlyRate = Number(hourlyRate);
      if (!Number.isFinite(numericHourlyRate) || numericHourlyRate <= 0) {
        return res.status(400).json({
          status: false,
          message: "hourlyRate must be a positive number.",
        });
      }
    } else {
      // For Rejected / Disconnected / Pending — employer must NOT send hourlyRate
      if (hourlyRate !== undefined) {
        return res.status(400).json({
          status: false,
          message:
            "hourlyRate should not be sent unless approval status is Approved.",
        });
      }
    }

    // 3) load application
    const application = await JobApplication.findById(applicationId).select(
      "_id jobPostId employerApprovalStatus hourlyRate"
    );
    if (!application) {
      return res.status(404).json({
        status: false,
        message: "Job application not found.",
      });
    }

    const prev = application.employerApprovalStatus;

    // ✅ Rule: can disconnect only if currently Approved
    if (employerApprovalStatus === "Disconnected" && prev !== "Approved") {
      return res.status(400).json({
        status: false,
        message:
          "You can disconnect only those applications whose status is currently Approved.",
      });
    }

    // 4) if employer, verify ownership
    if (role === "employer") {
      const post = await JobPost.findById(application.jobPostId).select("userId");
      if (!post) {
        return res.status(404).json({
          status: false,
          message: "Job post not found.",
        });
      }
      if (!post.userId.equals(userId)) {
        return res.status(403).json({
          status: false,
          message:
            "You are not allowed to update approval status for this application.",
        });
      }
    }

    // 5) perform update
    application.employerApprovalStatus = employerApprovalStatus;

    // set hourlyRate only when Approved
    if (employerApprovalStatus === "Approved") {
      application.hourlyRate = numericHourlyRate;
    } else {
      // optional: clear any previous rate when it becomes Rejected/Disconnected/Pending
      application.hourlyRate = null;
    }

    await application.save();

    return res.status(200).json({
      status: true,
      message: "Employer approval status updated successfully.",
      data: {
        applicationId: application._id,
        previousStatus: prev,
        currentStatus: application.employerApprovalStatus,
        hourlyRate: application.hourlyRate,
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
        .select("userId jobSeekerId jobPostId status employerApprovalStatus appliedAt createdAt hourlyRate")
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

           hourlyRate: a.hourlyRate ?? null,

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



// exports.updateEmployerApprovalStatus = async (req, res) => {
//   try {
//     const { role, userId } = req.user;
//     const { applicationId, employerApprovalStatus } = req.body;

//     // 1) auth: only employer or admin
//     if (role !== "employer" && role !== "admin") {
//       return res.status(403).json({
//         status: false,
//         message: "Only employers or admins can update approval status.",
//       });
//     }

//     // 2) validate inputs
//     if (!applicationId || !mongoose.isValidObjectId(applicationId)) {
//       return res.status(400).json({
//         status: false,
//         message: "Valid Job Application ID is required.",
//       });
//     }

//     const allowed = ["Pending", "Approved", "Rejected", "Disconnected"];
//     if (!employerApprovalStatus || !allowed.includes(employerApprovalStatus)) {
//       return res.status(400).json({
//         status: false,
//         message: `Invalid approval status. Allowed values: ${allowed.join(", ")}`,
//       });
//     }

//     // 3) load application
//     const application = await JobApplication.findById(applicationId).select(
//       "_id jobPostId employerApprovalStatus"
//     );
//     if (!application) {
//       return res.status(404).json({
//         status: false,
//         message: "Job application not found.",
//       });
//     }

//     const prev = application.employerApprovalStatus;

//     // ✅ Rule: can disconnect only if currently Approved
//     if (employerApprovalStatus === "Disconnected" && prev !== "Approved") {
//       return res.status(400).json({
//         status: false,
//         message:
//           "You can disconnect only those applications whose status is currently Approved.",
//       });
//     }

//     // 4) if employer, verify ownership
//     if (role === "employer") {
//       const post = await JobPost.findById(application.jobPostId).select("userId");
//       if (!post) {
//         return res.status(404).json({
//           status: false,
//           message: "Job post not found.",
//         });
//       }
//       if (!post.userId.equals(userId)) {
//         return res.status(403).json({
//           status: false,
//           message:
//             "You are not allowed to update approval status for this application.",
//         });
//       }
//     }

//     // 5) perform update
//     application.employerApprovalStatus = employerApprovalStatus;
//     await application.save();

//     return res.status(200).json({
//       status: true,
//       message: "Employer approval status updated successfully.",
//       data: {
//         applicationId: application._id,
//         previousStatus: prev,
//         currentStatus: application.employerApprovalStatus,
//       },
//     });
//   } catch (err) {
//     console.error("updateEmployerApprovalStatus error:", err);
//     return res.status(500).json({
//       status: false,
//       message: "Server error.",
//       error: err.message,
//     });
//   }
// };



// exports.getApprovedApplicants = async (req, res) => {
//   try {
//     const { role, userId } = req.user;
//     const jobPostId = (req.query.jobPostId || "").trim();

//     // pagination
//     const pageParam = parseInt(req.query.page, 10);
//     const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

//     const limitRaw = (req.query.limit || "").toString().toLowerCase();
//     const limit =
//       limitRaw === "all"
//         ? 0
//         : (() => {
//             const n = parseInt(limitRaw || "10", 10);
//             if (!Number.isFinite(n) || n < 1) return 10;
//             return Math.min(n, 100);
//           })();
//     const skip = limit ? (page - 1) * limit : 0;

//     // Build the set of jobPostIds we’re allowed to look at
//     let postIds = [];

//     if (jobPostId) {
//       // validate given post id
//       if (!mongoose.isValidObjectId(jobPostId)) {
//         return res.status(400).json({ status: false, message: "Valid Job Post ID is required." });
//       }

//       const post = await JobPost.findById(jobPostId).select("_id userId isDeleted");
//       if (!post) return res.status(404).json({ status: false, message: "Job post not found." });
//       if (post.isDeleted) {
//         return res.status(410).json({ status: false, message: "This job post has been removed." });
//       }

//       // Access control: admin or the employer who owns this post
//       const isOwnerEmployer = role === "employer" && post.userId?.equals(userId);
//       if (!(role === "admin" || isOwnerEmployer)) {
//         return res.status(403).json({ status: false, message: "You are not allowed to view approved applicants for this post." });
//       }
//       postIds = [post._id];
//     } else {
//       // No jobPostId => Admin sees all, Employer sees only their posts
//       if (role === "admin") {
//         const all = await JobPost.find({ isDeleted: false }).select("_id");
//         postIds = all.map(p => p._id);
//       } else if (role === "employer") {
//         const mine = await JobPost.find({ userId, isDeleted: false }).select("_id");
//         postIds = mine.map(p => p._id);
//       } else {
//         return res.status(403).json({ status: false, message: "Only employers or admins can view approved applicants." });
//       }
//     }

//     // If there are no posts (e.g., employer with no posts), return empty set
//     if (postIds.length === 0) {
//       return res.status(200).json({
//         status: true,
//         message: "Approved applicants fetched successfully.",
//         totalRecord: 0,
//         totalPage: 1,
//         currentPage: 1,
//         data: []
//       });
//     }

//     // FILTER: only Approved employerApprovalStatus; usually still Applied
//     const filter = {
//       jobPostId: { $in: postIds },
//       employerApprovalStatus: "Approved",
//       status: "Applied" // keep only currently active applications
//     };

//     const [totalRecord, applications] = await Promise.all([
//       JobApplication.countDocuments(filter),
//       JobApplication.find(filter)
//         .select("userId jobSeekerId jobPostId status employerApprovalStatus appliedAt createdAt")
//         .populate({
//           path: "jobSeekerId",
//           match: { isDeleted: false },
//           select: [
//             "name",
//             "phoneNumber",
//             "email",
//             "state",
//             "city",
//             "image",
//             "jobProfile",
//             "dateOfBirth",
//             "gender",
//             "panCardNumber",
//             "address",
//             "alternatePhoneNumber",
//             "pincode",
//             "industryType"
//           ].join(" "),
//           populate: [
//             { path: "state", select: "state" },
//             { path: "jobProfile", select: "jobProfile name" },
//             { path: "industryType", select: "industryType name" }
//           ]
//         })
//         .populate({ path: "jobPostId", select: "jobTitle status" })
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(limit)
//         .lean()
//     ]);

//     // inline date formatter (DD-MM-YYYY)
//     const formatDate = (date) => {
//       if (!date) return null;
//       const d = new Date(date);
//       const day = String(d.getDate()).padStart(2, "0");
//       const month = String(d.getMonth() + 1).padStart(2, "0");
//       const year = d.getFullYear();
//       return `${day}-${month}-${year}`;
//     };

//     const data = applications
//       .filter(a => !!a.jobSeekerId) // exclude if profile filtered out
//       .map(a => {
//         const p = a.jobSeekerId;
//         return {
//           applicationId: a._id.toString(),
//           jobPostId: a.jobPostId?._id?.toString() || null,
//           jobTitle: a.jobPostId?.jobTitle || null,

//           status: a.status, // "Applied"
//           employerApprovalStatus: a.employerApprovalStatus, // "Approved"
//           appliedAt: formatDate(a.appliedAt),

//           // flattened job seeker fields
//           jobSeekerName: p.name ?? null,
//           phoneNumber: p.phoneNumber ?? null,
//           email: p.email ?? null,
//           dateOfBirth: formatDate(p.dateOfBirth),
//           gender: p.gender ?? null,
//           panCardNumber: p.panCardNumber ?? null,
//           address: p.address ?? null,
//           alternatePhoneNumber: p.alternatePhoneNumber ?? null,
//           pincode: p.pincode ?? null,
//           state: p.state?.state ?? null,
//           city: p.city ?? null,
//           image: p.image ?? null,
//           jobProfile: p.jobProfile ? (p.jobProfile.jobProfile || p.jobProfile.name || null) : null,
//           industryType: p.industryType ? (p.industryType.industryType || p.industryType.name || null) : null
//         };
//       });

//     const totalPage = limit && totalRecord > 0 ? Math.ceil(totalRecord / limit) : 1;
//     const currentPage = limit ? Math.min(page, totalPage || 1) : 1;

//     return res.status(200).json({
//       status: true,
//       message: "Approved applicants fetched successfully.",
//       totalRecord,
//       totalPage,
//       currentPage,
//       data
//     });
//   } catch (err) {
//     console.error("getApprovedApplicants error:", err);
//     return res.status(500).json({ status: false, message: "Server error", error: err.message });
//   }
// };
