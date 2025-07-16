const Skill = require("../models/Skills");
const JobSeekerProfile = require("../models/JobSeekerProfile");

exports.createSkills = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can save skills.",
      });
    }

    const { skills } = req.body;

    if (!skills || !Array.isArray(skills) || skills.length < 4) {
      return res.status(400).json({
        status: false,
        message: "Please provide at least 4 skills.",
      });
    }

    const jobSeekerProfile = await JobSeekerProfile.findOne({ userId });
    if (!jobSeekerProfile) {
      return res.status(400).json({
        status: false,
        message: "Please complete your job seeker profile first.",
      });
    }

    const updatedSkill = await Skill.findOneAndUpdate(
      { userId },
      {
        userId,
        jobSeekerId: jobSeekerProfile._id,
        skills,
      },
      { new: true, upsert: true }
    );

    res.status(201).json({
      status: true,
      message: "Skills saved successfully.",
      data: updatedSkill,
    });
  } catch (error) {
    console.error("Error saving skills:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};


exports.getMySkills = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can get skills.",
      });
    }

    const skillRecord = await Skill.findOne({ userId }).lean();

    if (!skillRecord) {
      return res.status(404).json({
        status: false,
        message: "No skills found.",
      });
    }

  
    const response = {
      id: skillRecord._id,
      userId: skillRecord.userId,
      jobSeekerId: skillRecord.jobSeekerId,
      skills: skillRecord.skills,
    };

    res.json({
      status: true,
      data: response,
    });
  } catch (error) {
    console.error("Error fetching skills:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};


exports.deleteSelectedSkills = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can delete skills.",
      });
    }

    const { skills } = req.body;

    if (!skills || !Array.isArray(skills) || skills.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Please provide an array of skills to delete.",
      });
    }

    
    const result = await Skill.updateOne(
      { userId },
      { $pull: { skills: { $in: skills } } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        status: false,
        message: "No matching skills found to delete.",
      });
    }

    res.json({
      status: true,
      message: "Selected skills deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting selected skills:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};



