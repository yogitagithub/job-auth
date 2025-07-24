const Skill = require("../models/Skills");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const mongoose = require("mongoose");

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

    // Convert empty string to null
    const sanitizedSkill = skills?.trim() === "" ? null : skills?.trim();

    const jobSeekerProfile = await JobSeekerProfile.findOne({ userId });
    if (!jobSeekerProfile) {
      return res.status(400).json({
        status: false,
        message: "Please complete your job seeker profile first.",
      });
    }

    const newSkill = new Skill({
      userId,
      jobSeekerId: jobSeekerProfile._id,
      skills: sanitizedSkill,  // will be null if empty
    });

    await newSkill.save();

    res.status(201).json({
      status: true,
      message: "Skill saved successfully.",
      // data: newSkill,
    });
  } catch (error) {
    console.error("Error saving skill:", error);
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
        message: "Only job seekers can view their skills.",
      });
    }

    const skills = await Skill.find({ userId });

    if (skills.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No skills found.",
      });
    }

    const formatted = skills.map((skill) => ({
      id: skill._id,
      skills: skill.skills ?? null,
    }));

    res.status(200).json({
      status: true,
      message: "Skills fetched successfully.",
      data: formatted,
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

exports.updateSkillById = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { skillId, skills } = req.body;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can update skills.",
      });
    }

    if (!skillId || !mongoose.Types.ObjectId.isValid(skillId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid or missing skill ID.",
      });
    }

    // Convert empty string to null
    const sanitizedSkill = skills?.trim() === "" ? null : skills?.trim();

    const skill = await Skill.findOneAndUpdate(
      { _id: skillId, userId },
      { skills: sanitizedSkill },
      { new: true }
    );

    if (!skill) {
      return res.status(404).json({
        status: false,
        message: "Skill not found or unauthorized access.",
      });
    }

    res.status(200).json({
      status: true,
      message: "Skill updated successfully."
      // data: {
      //   id: skill._id,
      //   skills: skill.skills,
      // },
    });
  } catch (error) {
    console.error("Error updating skill:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};


exports.deleteSkillById = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { skillId } = req.body; // Get skillId from body instead of params

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can delete skills.",
      });
    }

    if (!skillId || !mongoose.Types.ObjectId.isValid(skillId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid or missing skill ID.",
      });
    }

    const deletedSkill = await Skill.findOneAndDelete({
      _id: skillId,
      userId,
    });

    if (!deletedSkill) {
      return res.status(404).json({
        status: false,
        message: "Skill not found or unauthorized access.",
      });
    }

    res.status(200).json({
      status: true,
      message: "Skill deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting skill:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};


