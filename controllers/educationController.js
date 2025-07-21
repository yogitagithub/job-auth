const JobSeekerEducation = require("../models/Education");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const mongoose = require("mongoose");


exports.createEducation = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can add education.",
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
        message: "No education data provided.",
      });
    }

    const educationsToAdd = Array.isArray(body) ? body : [body];

    // Convert empty strings to null and prepare entries
    const sanitizedEducations = educationsToAdd.map((edu) => ({
      userId,
      jobSeekerId: jobSeekerProfile._id,
      degree: edu.degree?.trim() === "" ? null : edu.degree ?? null,
      boardOfUniversity: edu.boardOfUniversity?.trim() === "" ? null : edu.boardOfUniversity ?? null,
      sessionFrom: edu.sessionFrom?.trim?.() === "" ? null : edu.sessionFrom ?? null,
      sessionTo: edu.sessionTo?.trim?.() === "" ? null : edu.sessionTo ?? null,
      marks: edu.marks?.trim() === "" ? null : edu.marks ?? null,
      gradeOrPercentage: edu.gradeOrPercentage?.trim() === "" ? null : edu.gradeOrPercentage ?? null,
    }));

    await JobSeekerEducation.insertMany(sanitizedEducations);

    res.status(201).json({
      status: true,
      message: "Education records saved successfully.",
    });
  } catch (error) {
    console.error("Error saving education:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};


exports.getMyEducation = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view education records.",
      });
    }

    const educations = await JobSeekerEducation.find({ userId });

    if (educations.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No education records found.",
      });
    }

    const formatted = educations.map((edu) => ({
      id: edu._id,
      degree: edu.degree,
      boardOfUniversity: edu.boardOfUniversity,
      sessionFrom: edu.sessionFrom ? edu.sessionFrom.toISOString().split("T")[0] : null,
      sessionTo: edu.sessionTo ? edu.sessionTo.toISOString().split("T")[0] : null,
      marks: edu.marks,
      gradeOrPercentage: edu.gradeOrPercentage,
    }));

    res.status(200).json({
      status: true,
      message: "Education list fetched successfully.",
      data: formatted,
    });

  } catch (err) {
    console.error("Error fetching educations:", err);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message,
    });
  }
};



exports.getEducationById = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { educationId } = req.params;

    // Role check
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view education records.",
      });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(educationId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid education ID format.",
      });
    }

    // Find education belonging to the user
    const education = await JobSeekerEducation.findOne({
      userId,
      _id: educationId,
    });

    if (!education) {
      return res.status(404).json({
        status: false,
        message: "Education record not found.",
      });
    }

    // Format response
    const formatted = {
      id: education._id,
      degree: education.degree,
      boardOfUniversity: education.boardOfUniversity,
      sessionFrom: education.sessionFrom
        ? education.sessionFrom.toISOString().split("T")[0]
        : null,
      sessionTo: education.sessionTo
        ? education.sessionTo.toISOString().split("T")[0]
        : null,
      marks: education.marks,
      gradeOrPercentage: education.gradeOrPercentage,
    };

    res.status(200).json({
      status: true,
      message: "Education record fetched successfully.",
      data: formatted,
    });
  } catch (err) {
    console.error("Error fetching education by ID:", err);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message,
    });
  }
};



exports.updateEducationById = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { educationId } = req.params;
    const updateFields = req.body;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can update education records.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(educationId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid education ID.",
      });
    }

    const education = await JobSeekerEducation.findOne({
      _id: educationId,
      userId,
    });

    if (!education) {
      return res.status(404).json({
        status: false,
        message: "Education record not found.",
      });
    }

    // Update only allowed fields
    const allowedFields = [
      "degree",
      "boardOfUniversity",
      "sessionFrom",
      "sessionTo",
      "marks",
      "gradeOrPercentage",
    ];

    allowedFields.forEach((field) => {
      if (updateFields[field] !== undefined) {
        education[field] = updateFields[field];
      }
    });

    await education.save();

    res.status(200).json({
      status: true,
      message: "Education record updated successfully.",
      data: {
        id: education._id,
        degree: education.degree,
        boardOfUniversity: education.boardOfUniversity,
        sessionFrom: education.sessionFrom?.toISOString().split("T")[0],
        sessionTo: education.sessionTo?.toISOString().split("T")[0],
        marks: education.marks,
        gradeOrPercentage: education.gradeOrPercentage,
      },
    });
  } catch (err) {
    console.error("Error updating education:", err);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message,
    });
  }
};


exports.deleteEducationById = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { educationId } = req.params;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can delete education records.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(educationId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid education ID.",
      });
    }

    const education = await JobSeekerEducation.findOneAndDelete({
      _id: educationId,
      userId,
    });

    if (!education) {
      return res.status(404).json({
        status: false,
        message: "Education record not found or unauthorized.",
      });
    }

    res.status(200).json({
      status: true,
      message: "Education record deleted successfully.",
    });
  } catch (err) {
    console.error("Error deleting education:", err);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message,
    });
  }
};
