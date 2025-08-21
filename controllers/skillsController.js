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
      skills: sanitizedSkill,  
    });

    await newSkill.save();

    res.status(201).json({
      status: true,
      message: "Skill saved successfully.",
     
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

    // Pagination
    const pageRaw  = parseInt(req.query.page, 10);
    const limitRaw = parseInt(req.query.limit, 10);
    const page  = Number.isFinite(pageRaw)  && pageRaw  > 0 ? pageRaw  : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 5; // cap to 50
    const skip  = (page - 1) * limit;

    // Exclude soft-deleted
    const filter = { userId, isDeleted: { $ne: true } };

    // Count and fetch
    const totalRecord = await Skill.countDocuments(filter);
    const totalPage   = totalRecord === 0 ? 0 : Math.ceil(totalRecord / limit);

    const skills = await Skill.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const data = skills.map((s) => ({
      id: s._id,
      skills: s.skills ?? null,
    }));

    return res.status(200).json({
      status: true,
      message: totalRecord ? "Skills fetched successfully." : "No skills found.",
      totalRecord,
      totalPage,
      currentPage: page,
      data,
    });
  } catch (error) {
    console.error("Error fetching skills:", error);
    return res.status(500).json({
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

    // Load first so we can check soft-delete state & ownership
    const existing = await Skill.findOne({ _id: skillId, userId });

    if (!existing) {
      return res.status(404).json({
        status: false,
        message: "Skill not found or unauthorized access.",
      });
    }

    // ⛔ Block updates to soft-deleted records
    if (existing.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This skill has been soft deleted and cannot be updated.",
      });
    }

    // Sanitize input
    if (typeof skills === "undefined") {
      return res.status(400).json({
        status: false,
        message: "No valid fields provided to update.",
      });
    }
    const sanitizedSkill = skills?.trim() === "" ? null : skills?.trim();

    existing.skills = sanitizedSkill;
    await existing.save();

    return res.status(200).json({
      status: true,
      message: "Skill updated successfully.",
      // If you want to return the updated doc:
      // data: { id: existing._id, skills: existing.skills }
    });
  } catch (error) {
    console.error("Error updating skill:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

exports.deleteSkillById = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { skillId } = req.body;

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

    // Fetch first to check ownership and soft-delete status
    const existing = await Skill.findOne({ _id: skillId, userId })
      .select("_id isDeleted");

    if (!existing) {
      return res.status(404).json({
        status: false,
        message: "Skill not found or unauthorized access.",
      });
    }

    if (existing.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This skill is already soft deleted.",
      });
    }

    // Perform soft delete
    await Skill.updateOne(
      { _id: skillId, userId },
      { $set: { isDeleted: true, deletedAt: new Date() } } // deletedAt optional
    );

    return res.status(200).json({
      status: true,
      message: "Skill deleted successfully (soft delete).",
    });
  } catch (error) {
    console.error("Error deleting skill:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};
