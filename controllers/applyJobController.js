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
      .populate({ path: "userId", select: "name phoneNumber email role" })
      .populate({
        path: "jobSeekerId",
        populate: [
          { path: "jobProfile", select: "name" },
          { path: "state", select: "state" },
          { path: "industryType", select: "name" }
        ]
      })
      .populate({
        path: "jobPostId",
        populate: [
          { path: "companyId", select: "companyName" },
          { path: "category", select: "name" },
          { path: "industryType", select: "name" },
          { path: "state", select: "state" }
        ],
        select: "jobTitle jobDescription salaryType jobType skills minSalary maxSalary expiredDate status"
      })
      .populate({ path: "educationId", select: "degree boardOfUniversity sessionFrom sessionTo marks gradeOrPercentage" })
      .populate({ path: "experienceId", select: "companyName jobTitle sessionFrom sessionTo roleDescription" })
      .populate({ path: "skillsId", select: "skills" })
      .populate({ path: "resumeId", select: "fileName fileUrl" })
      .lean();

    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
    };

    const transformed = applications.map((app) => {
     
      if (app.jobSeekerId) {
        if (app.jobSeekerId.jobProfile?.name) app.jobSeekerId.jobProfile = app.jobSeekerId.jobProfile.name;
        if (app.jobSeekerId.state?.state) app.jobSeekerId.state = app.jobSeekerId.state.state;
        if (app.jobSeekerId.industryType?.name) app.jobSeekerId.industryType = app.jobSeekerId.industryType.name;
       
        if (app.jobSeekerId.dateOfBirth) {
      app.jobSeekerId.dateOfBirth = formatDate(app.jobSeekerId.dateOfBirth);
    } 

  }

      if (app.jobPostId) {
        if (app.jobPostId.companyId?.companyName) app.jobPostId.companyId = app.jobPostId.companyId.companyName;
        if (app.jobPostId.category?.name) app.jobPostId.category = app.jobPostId.category.name;
        if (app.jobPostId.industryType?.name) app.jobPostId.industryType = app.jobPostId.industryType.name;
        if (app.jobPostId.state?.state) app.jobPostId.state = app.jobPostId.state.state;
        app.jobPostId.expiredDate = formatDate(app.jobPostId.expiredDate);
      }

     
      if (app.appliedAt) app.appliedAt = formatDate(app.appliedAt);
      if (app.educationId) {
        app.educationId.sessionFrom = formatDate(app.educationId.sessionFrom);
        app.educationId.sessionTo = formatDate(app.educationId.sessionTo);
      }
      if (app.experienceId) {
        app.experienceId.sessionFrom = formatDate(app.experienceId.sessionFrom);
        app.experienceId.sessionTo = formatDate(app.experienceId.sessionTo);
      }

      return app;
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

