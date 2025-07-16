const WorkExperience = require("../models/WorkExperience");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const mongoose = require("mongoose");


exports.createWorkExp = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can add their work experience",
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

    const updatedRecord = await WorkExperience.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          userId,
          jobSeekerId: jobSeekerProfile._id,
        },
        $push: {
          workExperiences: { $each: experiencesToAdd },
        },
      },
      { new: true, upsert: true }
    );

    return res.status(201).json({
      status: true,
      message: "Work experience saved successfully.",
      data: updatedRecord,
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
    const { userId } = req.user;

    const experienceRecord = await WorkExperience.findOne({ userId })
      .populate({
        path: "userId",
        select: "phoneNumber role"
      })
      .populate("jobSeekerId")
      .lean();

    if (!experienceRecord) {
      return res.status(404).json({
        status: false,
        message: "Experience record not found.",
      });
    }

  
    delete experienceRecord.__v;
    delete experienceRecord.createdAt;
    delete experienceRecord.updatedAt;

    experienceRecord.id = experienceRecord._id;
    delete experienceRecord._id;

   
    if (experienceRecord.workExperiences && Array.isArray(experienceRecord.workExperiences)) {
      experienceRecord.workExperiences = experienceRecord.workExperiences.map((exp) => {
        exp.id = exp._id;
        delete exp._id;

        if (exp.sessionFrom) {
          exp.sessionFrom = new Date(exp.sessionFrom)
            .toLocaleDateString("en-GB")
            .split("/")
            .join("-");
        }

        if (exp.sessionTo) {
          exp.sessionTo = new Date(exp.sessionTo)
            .toLocaleDateString("en-GB")
            .split("/")
            .join("-");
        }

        return exp;
      });
    }

   
    if (experienceRecord.userId && experienceRecord.userId._id) {
      experienceRecord.userId.id = experienceRecord.userId._id;
      delete experienceRecord.userId._id;
    }

   
    if (experienceRecord.jobSeekerId && experienceRecord.jobSeekerId._id) {
      experienceRecord.jobSeekerId.id = experienceRecord.jobSeekerId._id;
      delete experienceRecord.jobSeekerId._id;

      delete experienceRecord.jobSeekerId.__v;
      delete experienceRecord.jobSeekerId.createdAt;
      delete experienceRecord.jobSeekerId.updatedAt;

     
      if (experienceRecord.jobSeekerId.dateOfBirth) {
        const dob = new Date(experienceRecord.jobSeekerId.dateOfBirth);
        const day = String(dob.getDate()).padStart(2, "0");
        const month = String(dob.getMonth() + 1).padStart(2, "0");
        const year = dob.getFullYear();
        experienceRecord.jobSeekerId.dateOfBirth = `${day}-${month}-${year}`;
      }
    }

    res.json({
      status: true,
      data: experienceRecord,
    });
  } catch (error) {
    console.error("Error fetching experiences:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};


exports.updateWorkExp = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can update experience.",
      });
    }

    const { updates } = req.body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Provide an array of updates.",
      });
    }

    let modifiedCount = 0;

    for (const update of updates) {
      const { experienceId, ...fields } = update;

      if (!experienceId) continue;
      if (Object.keys(fields).length === 0) continue;

      
      const experienceObjectId = new mongoose.Types.ObjectId(experienceId);

      const setObj = {};
      for (const [key, value] of Object.entries(fields)) {
        setObj[`workExperiences.$.${key}`] = value;
      }

      const result = await WorkExperience.updateOne(
        {
          userId,
          "workExperiences._id": experienceObjectId
        },
        { $set: setObj }
      );

      if (result.modifiedCount > 0) {
        modifiedCount++;
      }
    }

    res.json({
      status: true,
      message: `${modifiedCount} experience record updated successfully.`,
    });
  } catch (error) {
    console.error("Error updating experiences:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};



exports.deleteWorkExp = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can delete experience.",
      });
    }

    let idsToDelete = [];

    if (req.query.experienceId) {
      idsToDelete = req.query.experienceId.split(",").map(id => id.trim());
    } else {
      return res.status(400).json({
        status: false,
        message: "Provide experienceId query parameter (single or comma-separated).",
      });
    }

    const result = await WorkExperience.updateOne(
      { userId },
      { $pull: { workExperiences: { _id: { $in: idsToDelete } } } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        status: false,
        message: "No matching experience records found to delete.",
      });
    }

    res.json({
      status: true,
      message: `${idsToDelete.length} experience record deleted successfully.`,
    });
  } catch (error) {
    console.error("Error deleting experience:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};


