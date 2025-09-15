const Resume = require("../models/Resume");
const fs = require("fs");
const path = require("path");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const JobPost = require("../models/JobPost");
const JobApplication = require("../models/JobApplication");
const mongoose = require("mongoose");



exports.createResume = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, role } = req.user || {};
    if (role !== "job_seeker") {
      await session.abortTransaction(); session.endSession();
      return res.status(403).json({ status: false, message: "Only job seekers can upload resumes." });
    }

    const profile = await JobSeekerProfile.findOne({ userId, isDeleted: false })
      .select("_id")
      .session(session);

    if (!profile) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ status: false, message: "Please complete your job seeker profile first." });
    }

    if (!req.file) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ status: false, message: "No file uploaded." });
    }

    // Only consider active (not soft-deleted) resume for updates
    const activeResume = await Resume.findOne({ userId, isDeleted: { $ne: true } }).session(session);

    const fileUrl = `${process.env.BASE_URL}/uploads/resumes/${req.file.filename}`;

    if (activeResume) {
      // Best-effort delete of the previous file
      try {
        const prevName = path.basename(activeResume.fileUrl || "");
        const prevPath = path.join(__dirname, "..", "uploads", "resumes", prevName);
        if (prevName && fs.existsSync(prevPath)) fs.unlinkSync(prevPath);
      } catch (e) {
        console.warn("Could not remove old resume file:", e.message);
      }

      // Update doc
      activeResume.fileUrl = fileUrl;
      activeResume.fileName = req.file.originalname;
      activeResume.fileType = req.file.mimetype;
      activeResume.fileSize = req.file.size;
      activeResume.isDeleted = false; // ensure active
      await activeResume.save({ session });
    } else {
      // Create new
      await Resume.create([{
        userId,
        jobSeekerId: profile._id,
        fileUrl,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        isDeleted: false
      }], { session });
    }

    // Flip profile flag
    await JobSeekerProfile.updateOne(
      { _id: profile._id },
      { $set: { isResumeAdded: true } },
      { session }
    );

    await session.commitTransaction(); session.endSession();

    return res.status(200).json({
      status: true,
      message: activeResume ? "Resume updated successfully." : "Resume uploaded successfully.",
      data: { resume: fileUrl }
    });

  } catch (error) {
    await session.abortTransaction(); session.endSession();
    console.error("Error uploading resume:", error);
    return res.status(500).json({ status: false, message: "Server error.", error: error.message });
  }
};


exports.getMyResume = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can access this resource.",
      });
    }

    // Fetch without filtering isDeleted so we can detect soft-deleted state
    const resume = await Resume.findOne({ userId }).lean();

    if (!resume) {
      return res.status(200).json({
        status: false,
        message: "No resume found for this user.",
      });
    }

    // Soft-deleted? -> block with 400
    if (resume.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This resume has been soft deleted and cannot be viewed.",
      });
    }

    const data = {
      id: resume._id,
      userId: resume.userId,
      jobSeekerId: resume.jobSeekerId || null,
      fileUrl: resume.fileUrl,
      fileName: resume.fileName,
      fileType: resume.fileType,
      fileSize: resume.fileSize,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt,
    };

    return res.status(200).json({
      status: true,
      message: "Resume fetched successfully.",
      data,
    });
  } catch (error) {
    console.error("Error fetching my resume:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

exports.deleteResume = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can delete resumes.",
      });
    }

    // Fetch regardless of isDeleted so we can detect the soft-deleted state
    const resume = await Resume.findOne({ userId });

    if (!resume) {
      return res.status(404).json({
        status: false,
        message: "Resume not found for this user.",
      });
    }

    // Already soft-deleted?
    if (resume.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This resume has already been soft deleted.",
      });
    }

    // Soft delete
    resume.isDeleted = true;
    // if your schema supports it, also store a timestamp:
    resume.deletedAt = new Date(); // add deletedAt: { type: Date } in schema if you want
    await resume.save();

    return res.status(200).json({
      status: true,
      message: "Resume deleted successfully (soft delete).",
    });
  } catch (error) {
    console.error("Error deleting resume:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

//employer can get job seeker resume 
exports.getSeekerResumeForEmployer = async (req, res) => {
  try {
    const { userId, role } = req.user || {};
    const { jobSeekerId } = req.body || {};

    // ✅ allow only employers
    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can access this resource.",
      });
    }

    // ✅ validate input
    if (!jobSeekerId || !mongoose.isValidObjectId(jobSeekerId)) {
      return res.status(400).json({
        status: false,
        message: "Valid jobSeekerId is required.",
      });
    }

    // ✅ employer must have active (non-deleted) posts
    const posts = await JobPost.find({ userId, isDeleted: false })
      .select("_id")
      .lean();
    if (!posts.length) {
      return res.status(403).json({
        status: false,
        message: "You have no active job posts.",
      });
    }
    const postIds = posts.map(p => p._id);

    // ✅ gate: seeker must have an active, non-rejected application to employer's posts
    const hasActiveApp = await JobApplication.exists({
      jobSeekerId: mongoose.Types.ObjectId.createFromHexString(jobSeekerId),
      jobPostId: { $in: postIds },
      status: "Applied",
      employerApprovalStatus: { $ne: "Rejected" },
      isDeleted: { $ne: true } // harmless if field isn't present
    });
    if (!hasActiveApp) {
      return res.status(403).json({
        status: false,
        message: "This candidate has no active (non-rejected) application to your job posts.",
      });
    }

    // ✅ seeker must exist & not be soft-deleted
    const seeker = await JobSeekerProfile.findById(jobSeekerId)
      .select("_id userId isDeleted")
      .lean();
    if (!seeker) {
      return res.status(404).json({ status: false, message: "Job seeker not found." });
    }
    if (seeker.isDeleted) {
      return res.status(409).json({
        status: false,
        message: "This job seeker profile is disabled.",
      });
    }

    // ✅ fetch resume (support both storage patterns: by jobSeekerId or by userId)
    const resume = await Resume.findOne({
      $or: [{ jobSeekerId }, { userId: seeker.userId }],
    }).lean();

    if (!resume) {
      return res.status(200).json({
        status: false,
        message: "No resume found for this user.",
      });
    }

    if (resume.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This resume has been soft deleted and cannot be viewed.",
      });
    }

    const data = {
      id: resume._id,
      userId: resume.userId,
      jobSeekerId: resume.jobSeekerId || null,
      fileUrl: resume.fileUrl,
      fileName: resume.fileName,
      fileType: resume.fileType,
      fileSize: resume.fileSize,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt,
    };

    return res.status(200).json({
      status: true,
      message: "Resume fetched successfully.",
      data,
    });
  } catch (error) {
    console.error("getCandidateResumeForEmployer error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};


