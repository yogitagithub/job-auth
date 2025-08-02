const JobApplication = require("../models/JobApplication");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const JobSeekerEducation = require("../models/Education");
const WorkExperience = require("../models/WorkExperience");
const Skill = require("../models/Skills");
const Resume = require("../models/Resume");

exports.applyJobs = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { jobPostId } = req.body;

    // Validate role
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can apply for jobs.",
      });
    }

    // Validate input
    if (!jobPostId) {
      return res.status(400).json({
        status: false,
        message: "Job Post ID is required.",
      });
    }

    // Check if already applied to this job
    const existing = await JobApplication.findOne({ userId, jobPostId });
    if (existing) {
      return res.status(400).json({
        status: false,
        message: "You have already applied for this job.",
      });
    }

    // Ensure profile completion
    const jobSeekerProfile = await JobSeekerProfile.findOne({ userId });
    if (!jobSeekerProfile) {
      return res.status(400).json({
        status: false,
        message: "Please complete your profile before applying.",
      });
    }

    // Load related details
    const [education, experience, skills, resume] = await Promise.all([
      JobSeekerEducation.findOne({ userId }),
      WorkExperience.findOne({ userId }),
      Skill.findOne({ userId }),
      Resume.findOne({ userId }),
    ]);

    // Validate all required linked documents
    if (!education || !experience || !skills || !resume) {
      return res.status(400).json({
        status: false,
        message: "Please complete your education, experience, skills, and upload resume before applying.",
      });
    }

    // Create the job application document
    const application = await JobApplication.create({
      userId,
      jobSeekerId: jobSeekerProfile._id,
      jobPostId,
      educationId: education._id,
      experienceId: experience._id,
      skillsId: skills._id,
      resumeId: resume._id,
      // status defaults to "Applied"
      // appliedAt defaults to Date.now
    });

    return res.status(201).json({
      status: true,
      message: "Job applied successfully.",
      data: application,
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
      .populate({
        path: "userId",
        select: "name phoneNumber email role"
      })
      .populate("jobPostId")
      .populate("jobSeekerId")
      .populate("educationId")
      .populate("experienceId")
      .populate("skillsId")
      .populate("resumeId")
      .lean();

    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    };

    const transformed = applications.map((app) => {
      const transformedApp = {
        ...app,
        id: app._id,
        appliedAt: formatDate(app.appliedAt),
      };

      delete transformedApp._id;
      delete transformedApp.__v;
      delete transformedApp.createdAt;
      delete transformedApp.updatedAt;

      // Fields to clean and format dates inside
      const fieldsToClean = [
        "userId",
        "jobPostId",
        "jobSeekerId",
        "educationId",
        "experienceId",
        "skillsId",
        "resumeId",
      ];

      fieldsToClean.forEach((field) => {
        if (transformedApp[field] && transformedApp[field]._id) {
          transformedApp[field].id = transformedApp[field]._id;
          delete transformedApp[field]._id;
          delete transformedApp[field].__v;
          delete transformedApp[field].createdAt;
          delete transformedApp[field].updatedAt;

          // Format dates in known fields
          if (transformedApp[field].sessionFrom) {
            transformedApp[field].sessionFrom = formatDate(
              transformedApp[field].sessionFrom
            );
          }
          if (transformedApp[field].sessionTo) {
            transformedApp[field].sessionTo = formatDate(
              transformedApp[field].sessionTo
            );
          }
          if (transformedApp[field].dateOfBirth) {
            transformedApp[field].dateOfBirth = formatDate(
              transformedApp[field].dateOfBirth
            );
          }
          if (transformedApp[field].appliedAt) {
            transformedApp[field].appliedAt = formatDate(
              transformedApp[field].appliedAt
            );
          }

          // Special: Format dates in nested arrays (education, work experience)
          if (Array.isArray(transformedApp[field].educations)) {
            transformedApp[field].educations = transformedApp[field].educations.map((edu) => {
              if (edu.sessionFrom) edu.sessionFrom = formatDate(edu.sessionFrom);
              if (edu.sessionTo) edu.sessionTo = formatDate(edu.sessionTo);
              edu.id = edu._id;
              delete edu._id;
              return edu;
            });
          }

          if (Array.isArray(transformedApp[field].workExperiences)) {
            transformedApp[field].workExperiences = transformedApp[field].workExperiences.map((exp) => {
              if (exp.sessionFrom) exp.sessionFrom = formatDate(exp.sessionFrom);
              if (exp.sessionTo) exp.sessionTo = formatDate(exp.sessionTo);
              exp.id = exp._id;
              delete exp._id;
              return exp;
            });
          }
        }
      });

      return transformedApp;
    });

    res.json({
      status: true,
      data: transformed,
    });
  } catch (error) {
    console.error("Error fetching applications:", error);
    res.status(500).json({
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
    const { applicationId } = req.params;  // Get from URL

    if (!status) {
      return res.status(400).json({
        status: false,
        message: "Status is required.",
      });
    }

    // For job seekers, only "Withdrawn" is allowed
    if (role === "job_seeker") {
      if (status !== "Withdrawn") {
        return res.status(400).json({
          status: false,
          message: "Job seekers can only set status to 'Withdrawn'.",
        });
      }
    } else {
      // Employers can set other statuses
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

    // If job seeker, ensure they own the application
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

    if (!employerApprovalStatus || !["Unapproved", "Approved"].includes(employerApprovalStatus)) {
      return res.status(400).json({
        status: false,
        message: "Invalid approval status. Allowed values: Unapproved, Approved",
      });
    }

    const application = await JobApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({
        status: false,
        message: "Job application not found.",
      });
    }

    // Employer updates approval status
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

