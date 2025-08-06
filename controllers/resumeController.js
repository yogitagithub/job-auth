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

    const existingResume = await Resume.findOne({ userId });

    if (existingResume) {
      // 1️⃣ Delete the old file
      const oldFilePath = path.join(__dirname, "..", "uploads", "resumes", path.basename(existingResume.fileUrl));
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }

      // 2️⃣ Update existing record (No new insert => No duplicate key)
      existingResume.fileUrl = `${process.env.BASE_URL}/uploads/resumes/${req.file.filename}`;
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

    // 3️⃣ If no resume exists, create new one
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

    res.status(201).json({
      status: true,
      message: "Resume uploaded successfully.",
      data: { resume: newResume.fileUrl },
    });

  } catch (error) {
    console.error("Error uploading resume:", error);
    res.status(500).json({
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

    // Find resume for the user
    const resume = await Resume.findOne({ userId, isDeleted: false });

    if (!resume) {
      return res.status(404).json({
        status: false,
        message: "No active resume found for this user.",
      });
    }

    // Soft delete (mark isDeleted as true)
    resume.isDeleted = true;
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
