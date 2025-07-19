const JobSeekerEducation = require("../models/Education");
const JobSeekerProfile = require("../models/JobSeekerProfile");

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

    const updatedRecord = await JobSeekerEducation.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          userId,
          jobSeekerId: jobSeekerProfile._id,
        },
        $push: {
          educations: { $each: educationsToAdd },
        },
      },
      { new: true, upsert: true }
    );

    res.status(201).json({
      status: true,
      message: "Education record saved successfully.",
      // data: updatedRecord,
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
    const { userId } = req.user;

    const educationRecord = await JobSeekerEducation.findOne({ userId })
      .populate({
        path: "userId",
        select: "phoneNumber role"
      })
      .populate("jobSeekerId")
      .lean();

    if (!educationRecord) {
      return res.status(404).json({
        status: false,
        message: "Education record not found.",
      });
    }

    // Remove __v, timestamps, and IDs you don't want
    delete educationRecord.__v;
    delete educationRecord.createdAt;
    delete educationRecord.updatedAt;
    delete educationRecord.userId;
    delete educationRecord.jobSeekerId;

    // Replace top-level _id with id
    educationRecord.id = educationRecord._id;
    delete educationRecord._id;

    // Format nested educations array
    if (educationRecord.educations && Array.isArray(educationRecord.educations)) {
      educationRecord.educations = educationRecord.educations.map((edu) => {
        edu.id = edu._id;
        delete edu._id;

        // Format sessionFrom (DD-MM-YYYY)
        if (edu.sessionFrom) {
          const fromDate = new Date(edu.sessionFrom);
          const day = String(fromDate.getDate()).padStart(2, "0");
          const month = String(fromDate.getMonth() + 1).padStart(2, "0");
          const year = fromDate.getFullYear();
          edu.sessionFrom = `${day}-${month}-${year}`;
        }

        // Format sessionTo (DD-MM-YYYY)
        if (edu.sessionTo) {
          const toDate = new Date(edu.sessionTo);
          const day = String(toDate.getDate()).padStart(2, "0");
          const month = String(toDate.getMonth() + 1).padStart(2, "0");
          const year = toDate.getFullYear();
          edu.sessionTo = `${day}-${month}-${year}`;
        }

        return edu;
      });
    }

    res.json({
      status: true,
      data: educationRecord,
    });
  } catch (error) {
    console.error("Error fetching education:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};


// exports.getMyEducation = async (req, res) => {
//   try {
//     const { userId } = req.user;

//     const educationRecord = await JobSeekerEducation.findOne({ userId })
//       .populate({
//         path: "userId",
//         select: "phoneNumber role"
//       })
//       .populate("jobSeekerId")
//       .lean();

//     if (!educationRecord) {
//       return res.status(404).json({
//         status: false,
//         message: "Education record not found.",
//       });
//     }

//     // Remove __v and timestamps
//     delete educationRecord.__v;
//     delete educationRecord.createdAt;
//     delete educationRecord.updatedAt;
    

//     // Replace _id with id
//     educationRecord.id = educationRecord._id;
//     delete educationRecord._id;

//     // Format nested educations array
//     if (educationRecord.educations && Array.isArray(educationRecord.educations)) {
//       educationRecord.educations = educationRecord.educations.map((edu) => {
//         edu.id = edu._id;
//         delete edu._id;

//         // Format sessionFrom
//         if (edu.sessionFrom) {
//           edu.sessionFrom = new Date(edu.sessionFrom)
//             .toLocaleDateString("en-GB")
//             .split("/")
//             .join("-");
//         }

//         // Format sessionTo
//         if (edu.sessionTo) {
//           edu.sessionTo = new Date(edu.sessionTo)
//             .toLocaleDateString("en-GB")
//             .split("/")
//             .join("-");
//         }

//         return edu;
//       });
//     }

//     // Format userId _id to id
//     if (educationRecord.userId && educationRecord.userId._id) {
//       educationRecord.userId.id = educationRecord.userId._id;
//       delete educationRecord.userId._id;
//     }

//     // Format jobSeekerId fields
//     if (educationRecord.jobSeekerId && educationRecord.jobSeekerId._id) {
//       educationRecord.jobSeekerId.id = educationRecord.jobSeekerId._id;
//       delete educationRecord.jobSeekerId._id;

//       delete educationRecord.jobSeekerId.__v;
//       delete educationRecord.jobSeekerId.createdAt;
//       delete educationRecord.jobSeekerId.updatedAt;

//       // Format dateOfBirth to DD-MM-YYYY
//       if (educationRecord.jobSeekerId.dateOfBirth) {
//         const dob = new Date(educationRecord.jobSeekerId.dateOfBirth);
//         const day = String(dob.getDate()).padStart(2, "0");
//         const month = String(dob.getMonth() + 1).padStart(2, "0");
//         const year = dob.getFullYear();
//         educationRecord.jobSeekerId.dateOfBirth = `${day}-${month}-${year}`;
//       }
//     }

//     res.json({
//       status: true,
//       data: educationRecord,
//     });
//   } catch (error) {
//     console.error("Error fetching education:", error);
//     res.status(500).json({
//       status: false,
//       message: "Server error.",
//       error: error.message,
//     });
//   }
// };


exports.updateEducation = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can update education.",
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
      const { educationId, ...fields } = update;

      if (!educationId) continue;

      if (Object.keys(fields).length === 0) continue;

      const setObj = {};
      for (const [key, value] of Object.entries(fields)) {
        setObj[`educations.$.${key}`] = value;
      }

      const result = await JobSeekerEducation.updateOne(
        { userId, "educations._id": educationId },
        { $set: setObj }
      );

      if (result.modifiedCount > 0) {
        modifiedCount++;
      }
    }

    res.json({
      status: true,
      message: `${modifiedCount} education record updated successfully.`,
    });
  } catch (error) {
    console.error("Error updating educations:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

exports.deleteEducation = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can delete education.",
      });
    }

    let idsToDelete = [];

    if (req.query.educationId) {
      idsToDelete = req.query.educationId.split(",").map(id => id.trim());
    } else {
      return res.status(400).json({
        status: false,
        message: "Provide educationId query parameter (single or comma-separated).",
      });
    }

    const result = await JobSeekerEducation.updateOne(
      { userId },
      { $pull: { educations: { _id: { $in: idsToDelete } } } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        status: false,
        message: "No matching education records found to delete.",
      });
    }

    res.json({
      status: true,
      message: `${idsToDelete.length} education record(s) deleted successfully.`,
    });
  } catch (error) {
    console.error("Error deleting educations:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};


