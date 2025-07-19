const Resume = require("../models/Resume");
const fs = require("fs");

exports.uploadResume = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can upload resumes.",
      });
    }

    const jobSeekerProfile = await require("../models/JobSeekerProfile").findOne({ userId });

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

 
    if (existingResume && existingResume.fileUrl) {
      fs.unlink(existingResume.fileUrl, (err) => {
        if (err) console.error("Error deleting old resume:", err);
      });
    }

    const resumeData = {
      userId,
      jobSeekerId: jobSeekerProfile._id,
      fileUrl: req.file.path,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
    };

    const updatedResume = await Resume.findOneAndUpdate(
      { userId },
      resumeData,
      { new: true, upsert: true }
    );

    res.status(201).json({
      status: true,
      message: existingResume ? "Resume updated successfully." : "Resume uploaded successfully.",
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


exports.deleteResume = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can delete resumes.",
      });
    }

    const existingResume = await Resume.findOne({ userId });

    if (!existingResume) {
      return res.status(404).json({
        status: false,
        message: "No resume found to delete.",
      });
    }

 
    if (existingResume.fileUrl) {
      fs.unlink(existingResume.fileUrl, (err) => {
        if (err) console.error("Error deleting resume file:", err);
      });
    }

    await Resume.deleteOne({ userId });

    res.json({
      status: true,
      message: "Resume deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting resume:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

// exports.getResumeByUserId = async (req, res) => {
//   try {
//     const { userId, role } = req.user; // Assuming JWT middleware adds req.user
//     const { id } = req.params; // userId passed as param

//     // Only job seekers or admins can access resumes
//     if (!["job_seeker", "admin"].includes(role)) {
//       return res.status(403).json({
//         status: false,
//         message: "Unauthorized access.",
//       });
//     }

//     const resume = await Resume.findOne({ userId: id });

//     if (!resume) {
//       return res.status(404).json({
//         status: false,
//         message: "Resume not found for this user.",
//       });
//     }

//     res.status(200).json({
//       status: true,
//       message: "Resume fetched successfully.",
//       data: resume,
//     });
//   } catch (error) {
//     console.error("Error fetching resume:", error);
//     res.status(500).json({
//       status: false,
//       message: "Server error.",
//       error: error.message,
//     });
//   }
// };
