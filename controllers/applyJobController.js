const JobApplication = require("../models/JobApplication");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const JobSeekerEducation = require("../models/Education");
const WorkExperience = require("../models/WorkExperience");
const Skill = require("../models/Skills");
const Resume = require("../models/Resume");
const JobPost = require("../models/JobPost");



exports.applyJobs = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { jobPostId } = req.body;

  
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can apply for jobs.",
      });
    }

   
    if (!jobPostId) {
      return res.status(400).json({
        status: false,
        message: "Job Post ID is required.",
      });
    }

   
    const existing = await JobApplication.findOne({ userId, jobPostId });
    if (existing) {
      return res.status(400).json({
        status: false,
        message: "You have already applied for this job.",
      });
    }


    const jobSeekerProfile = await JobSeekerProfile.findOne({ userId });
    if (!jobSeekerProfile) {
      return res.status(400).json({
        status: false,
        message: "Please complete your profile before applying.",
      });
    }


    const [education, experience, skills, resume] = await Promise.all([
      JobSeekerEducation.findOne({ userId }),
      WorkExperience.findOne({ userId }),
      Skill.findOne({ userId }),
      Resume.findOne({ userId }),
    ]);


     // NEW: build a dynamic “missing sections” list
    const missing = [];
    if (!education)  missing.push("Education");
    if (!experience) missing.push("Experience");
    if (!skills)     missing.push("Skills");
    if (!resume)     missing.push("Resume");


     // NEW: nice joiner: "A", "A and B", "A, B, and C"
    const humanJoin = (arr) =>
      arr.length <= 1 ? arr.join("") :
      arr.length === 2 ? `${arr[0]} and ${arr[1]}` :
      `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;

    // NEW: if anything missing, return tailored message
    if (missing.length > 0) {
      return res.status(400).json({
        status: false,
        message: `Please complete ${humanJoin(missing)} section${missing.length > 1 ? "s" : ""} before applying.`,
      });
    }


    if (!education || !experience || !skills || !resume) {
      return res.status(400).json({
        status: false,
        message: "Please complete your education, experience, skills, and upload resume before applying.",
      });
    }

 
    const application = await JobApplication.create({
      userId,
      jobSeekerId: jobSeekerProfile._id,
      jobPostId,
      educationId: education._id,
      experienceId: experience._id,
      skillsId: skills._id,
      resumeId: resume._id,
     
    });

    return res.status(201).json({
      status: true,
      message: "Job applied successfully.",

       data: {
    ...application.toObject(),
    appliedAt: application.appliedAt.toISOString().split("T")[0], 
  },
      
    });
  } catch (error) {
    console.error("Error applying job:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
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

    const applications = await JobApplication.find({ userId })
      .select("userId jobPostId status employerApprovalStatus appliedAt createdAt updatedAt")
      .populate({
        path: "jobPostId",
        select: "jobTitle state companyId createdAt",     // ⬅️ need createdAt for jobPosted
        populate: [
          { path: "state", select: "state" },
          { path: "companyId", select: "companyName image" }
        ]
      })
      .sort({ createdAt: -1 })
      .lean();

    // keep inline helpers inside controller (as you prefer)
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
    };

    // days-only, UTC-safe
    const daysAgo = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const createdUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const now = new Date();
      const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const diffDays = Math.max(0, Math.floor((todayUTC - createdUTC) / 86400000));
      return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    };

    const data = applications.map((app) => {
      const jp = app.jobPostId; // may be object (populated) or null

      return {
        _id: app._id,
        userId: (app.userId?._id || app.userId).toString(),               // plain string
        jobPostId: jp ? (jp?._id || jp).toString() : null,                 // plain string
        jobTitle: jp?.jobTitle ?? null,
        state: jp?.state?.state ?? null,
        companyName: jp?.companyId?.companyName ?? null,
        companyImage: jp?.companyId?.image ?? null,
        jobPosted: jp ? daysAgo(jp.createdAt) : null,                      // "X days ago" from job post createdAt
        status: app.status,
        employerApprovalStatus: app.employerApprovalStatus,
        appliedAt: formatDate(app.appliedAt),
        createdAt: app.createdAt,
        updatedAt: app.updatedAt
      };
    });

    return res.json({ status: true, data });
  } catch (error) {
    console.error("Error fetching applications:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { status } = req.body;
    const { applicationId } = req.params; 

    if (!status) {
      return res.status(400).json({
        status: false,
        message: "Status is required.",
      });
    }

   
    if (role === "job_seeker") {
      if (status !== "Withdrawn") {
        return res.status(400).json({
          status: false,
          message: "Job seekers can only set status to 'Withdrawn'.",
        });
      }
    } else {
     
      const allowedStatuses = ["Shortlisted", "Rejected", "Hired"];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          status: false,
          message: `Employers can only set statuses: ${allowedStatuses.join(", ")}`,
        });
      }
    }

    const application = await JobApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({
        status: false,
        message: "Job application not found.",
      });
    }

   
    if (role === "job_seeker" && !application.userId.equals(userId)) {
      return res.status(403).json({
        status: false,
        message: "You cannot update this application.",
      });
    }

    application.status = status;
    await application.save();

    res.json({
      status: true,
      message: `Application status updated to '${status}'.`,
      data: application,
    });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

exports.updateEmployerApprovalStatus = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { employerApprovalStatus } = req.body;
    const { applicationId } = req.params;

    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can update approval status.",
      });
    }

    if (!employerApprovalStatus || !["Pending", "Shortlisted", "Rejected", "Viewed"].includes(employerApprovalStatus)) {
      return res.status(400).json({
        status: false,
        message: "Invalid approval status. Allowed values: Pending, Shortlisted, Rejected, Viewed",
      });
    }

    const application = await JobApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({
        status: false,
        message: "Job application not found.",
      });
    }

   
    application.employerApprovalStatus = employerApprovalStatus;
    await application.save();

    res.json({
      status: true,
      message: `Employer approval status updated to '${employerApprovalStatus}'.`,
      data: application,
    });
  } catch (error) {
    console.error("Error updating employer approval status:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

