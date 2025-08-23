const Resume = require("../models/Resume");
const fs = require("fs");
const path = require("path");
const JobSeekerProfile = require("../models/JobSeekerProfile");

exports.createResume = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can upload resumes.",
      });
    }

    const jobSeekerProfile = await JobSeekerProfile.findOne({ userId });
    if (!jobSeekerProfile) {
      return res.status(400).json({
        status: false,
        message: "Please complete your job seeker profile first.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: false,
        message: "No file uploaded.",
      });
    }

    // Fetch regardless of isDeleted so we can detect soft-deleted state
    const existingResume = await Resume.findOne({ userId });

    // If a resume exists but is soft-deleted, block the update
    if (existingResume && existingResume.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This resume has been soft deleted and cannot be updated. Please create a new resume entry.",
      });
    }

    if (existingResume) {
      // Delete old file if present (best-effort)
      try {
        const oldFilePath = path.join(
          __dirname,
          "..",
          "uploads",
          "resumes",
          path.basename(existingResume.fileUrl || "")
        );
        if (oldFilePath && fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      } catch (e) {
        // don't fail the request because of filesystem issues
        console.warn("Warning: Could not remove old resume file:", e.message);
      }

      // Update metadata
      existingResume.fileUrl  = `${process.env.BASE_URL}/uploads/resumes/${req.file.filename}`;
      existingResume.fileName = req.file.originalname;
      existingResume.fileType = req.file.mimetype;
      existingResume.fileSize = req.file.size;

      await existingResume.save();

      return res.status(200).json({
        status: true,
        message: "Resume updated successfully. Old resume deleted.",
        data: { resume: existingResume.fileUrl },
      });
    }

    // No previous resume -> create new
    const fileUrl = `${process.env.BASE_URL}/uploads/resumes/${req.file.filename}`;
    const newResume = new Resume({
      userId,
      jobSeekerId: jobSeekerProfile._id,
      fileUrl,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
    });

    await newResume.save();

    return res.status(200).json({
      status: true,
      message: "Resume uploaded successfully.",
      data: { resume: newResume.fileUrl },
    });

  } catch (error) {
    console.error("Error uploading resume:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
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

