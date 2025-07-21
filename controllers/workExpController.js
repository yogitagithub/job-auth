const WorkExperience = require("../models/WorkExperience");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const mongoose = require("mongoose");

exports.createWorkExp = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can add their work experience.",
      });
    }

    const jobSeekerProfile = await JobSeekerProfile.findOne({ userId });

    if (!jobSeekerProfile) {
      return res.status(400).json({
        status: false,
        message: "Please complete your job seeker profile first.",
      });
    }

    const body = req.body;

    if (!body || (Array.isArray(body) && body.length === 0)) {
      return res.status(400).json({
        status: false,
        message: "No experience data provided.",
      });
    }

    const experiencesToAdd = Array.isArray(body) ? body : [body];

    const sanitizedExperiences = experiencesToAdd.map((exp) => ({
      userId,
      jobSeekerId: jobSeekerProfile._id,
      companyName: exp.companyName?.trim() === "" ? null : exp.companyName ?? null,
      jobTitle: exp.jobTitle?.trim() === "" ? null : exp.jobTitle ?? null,
      sessionFrom: exp.sessionFrom?.trim?.() === "" ? null : exp.sessionFrom ?? null,
      sessionTo: exp.sessionTo?.trim?.() === "" ? null : exp.sessionTo ?? null,
      roleDescription: exp.roleDescription?.trim() === "" ? null : exp.roleDescription ?? null,
    }));

    await WorkExperience.insertMany(sanitizedExperiences);

    return res.status(201).json({
      status: true,
      message: "Work experience records saved successfully.",
    });
  } catch (error) {
    console.error("Error saving work experience:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

exports.getMyWorkExp = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view work-experience records.",
      });
    }

    const experiences = await WorkExperience.find({ userId });

    if (experiences.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No work-experience records found.",
      });
    }

  
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const year = d.getUTCFullYear();
      return `${day}-${month}-${year}`;
    };

    const formatted = experiences.map((exp) => ({
      id: exp._id,
      companyName: exp.companyName,
      jobTitle: exp.jobTitle,
      sessionFrom: formatDate(exp.sessionFrom),
      sessionTo: formatDate(exp.sessionTo),
      roleDescription: exp.roleDescription,
    }));

    res.status(200).json({
      status: true,
      message: "Work-experience list fetched successfully.",
      data: formatted,
    });
  } catch (err) {
    console.error("Error fetching work experiences:", err);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message,
    });
  }
};

exports.getWorkExperienceById = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { experienceId } = req.params;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view work experience records.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(experienceId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid experience ID.",
      });
    }

    const experience = await WorkExperience.findOne({
      _id: experienceId,
      userId,
    });

    if (!experience) {
      return res.status(404).json({
        status: false,
        message: "Work experience not found or unauthorized access.",
      });
    }

    const formatted = {
      id: experience._id,
      companyName: experience.companyName,
      jobTitle: experience.jobTitle,
      sessionFrom: experience.sessionFrom
        ? experience.sessionFrom.toISOString().split("T")[0]
        : null,
      sessionTo: experience.sessionTo
        ? experience.sessionTo.toISOString().split("T")[0]
        : null,
      roleDescription: experience.roleDescription,
    };

    res.status(200).json({
      status: true,
      message: "Work experience fetched successfully.",
      data: formatted,
    });
  } catch (err) {
    console.error("Error fetching work experience:", err);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message,
    });
  }
};


exports.updateWorkExperienceById = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { experienceId, ...updateFields } = req.body;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can update work experience.",
      });
    }

    if (!experienceId || !mongoose.Types.ObjectId.isValid(experienceId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid or missing experience ID.",
      });
    }

    const experience = await WorkExperience.findOne({
      _id: experienceId,
      userId,
    });

    if (!experience) {
      return res.status(404).json({
        status: false,
        message: "Work experience not found or unauthorized access.",
      });
    }

    const allowedFields = [
      "companyName",
      "jobTitle",
      "sessionFrom",
      "sessionTo",
      "roleDescription",
    ];

    allowedFields.forEach((field) => {
      if (updateFields[field] !== undefined) {
        const value = updateFields[field];
        experience[field] =
          typeof value === "string" && value.trim() === "" ? null : value;
      }
    });

    await experience.save();

   
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const year = d.getUTCFullYear();
      return `${day}-${month}-${year}`;
    };

    const formatted = {
      id: experience._id,
      companyName: experience.companyName,
      jobTitle: experience.jobTitle,
      sessionFrom: formatDate(experience.sessionFrom),
      sessionTo: formatDate(experience.sessionTo),
      roleDescription: experience.roleDescription,
    };

    res.status(200).json({
      status: true,
      message: "Work experience updated successfully.",
      data: formatted,
    });
  } catch (err) {
    console.error("Error updating work experience:", err);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message,
    });
  }
};

exports.deleteWorkExperienceById = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { experienceId } = req.body;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can delete work experience.",
      });
    }

    if (!experienceId || !mongoose.Types.ObjectId.isValid(experienceId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid or missing experience ID.",
      });
    }

    const experience = await WorkExperience.findOneAndDelete({
      _id: experienceId,
      userId,
    });

    if (!experience) {
      return res.status(404).json({
        status: false,
        message: "Work experience not found or unauthorized.",
      });
    }

    res.status(200).json({
      status: true,
      message: "Work experience deleted successfully.",
    });
  } catch (err) {
    console.error("Error deleting work experience:", err);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message,
    });
  }
};




