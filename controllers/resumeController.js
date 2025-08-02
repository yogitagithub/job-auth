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

    // Check if a resume already exists
    const existingResume = await Resume.findOne({ userId });

    // Delete old file if exists
    if (existingResume) {
      const oldFilePath = path.join(__dirname, "..", "uploads", "resumes", path.basename(existingResume.fileUrl));
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    // Generate new file URL
    const fileUrl = `${req.protocol}://${req.get("host")}/uploads/resumes/${req.file.filename}`;

    const resumeData = {
      userId,
      jobSeekerId: jobSeekerProfile._id,
      fileUrl,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
    };

    // Update or insert resume
    const updatedResume = await Resume.findOneAndUpdate(
      { userId },
      resumeData,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({
      status: true,
      message: existingResume ? "Resume updated successfully. Old resume deleted." : "Resume uploaded successfully.",
      data: updatedResume,
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

