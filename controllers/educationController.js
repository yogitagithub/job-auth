const JobSeekerEducation = require("../models/Education");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const mongoose = require("mongoose");




exports.createEducation = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { userId, role } = req.user || {};

    if (role !== "job_seeker") {
      return res.status(403).json({ status: false, message: "Only job seekers can add education." });
    }

    const jobSeekerProfile = await JobSeekerProfile.findOne({ userId }).session(session);
    if (!jobSeekerProfile) {
      return res.status(400).json({ status: false, message: "Please complete your job seeker profile first." });
    }

    const body = req.body;
    if (!body || (Array.isArray(body) && body.length === 0)) {
      return res.status(400).json({ status: false, message: "No education data provided." });
    }

    const educationsToAdd = Array.isArray(body) ? body : [body];

    const sanitizedEducations = educationsToAdd.map((edu) => ({
      userId,
      jobSeekerId: jobSeekerProfile._id,
      degree: (edu.degree?.trim?.() || null),
      boardOfUniversity: (edu.boardOfUniversity?.trim?.() || null),
      sessionFrom: (edu.sessionFrom?.trim?.() || null),
      sessionTo: (edu.sessionTo?.trim?.() || null),
      marks: (edu.marks?.toString?.().trim?.() || null),
      gradeOrPercentage: (edu.gradeOrPercentage?.toString?.().trim?.() || null),
    }));

    await session.withTransaction(async () => {
      // 1) Insert education rows
      await JobSeekerEducation.insertMany(sanitizedEducations, { session });

      // 2) Flip the flag on profile
      await JobSeekerProfile.updateOne(
        { _id: jobSeekerProfile._id, isDeleted: false },
        { $set: { isEducationAdded: true } },
        { session }
      );
    });

    return res.status(201).json({ status: true, message: "Education records saved successfully." });
  } catch (error) {
    console.error("Error saving education:", error);
    return res.status(500).json({ status: false, message: "Server error.", error: error.message });
  } finally {
    session.endSession();
  }
};



// exports.createEducation = async (req, res) => {
//   try {
//     const { userId, role } = req.user;

//     if (role !== "job_seeker") {
//       return res.status(403).json({
//         status: false,
//         message: "Only job seekers can add education.",
//       });
//     }

//     const jobSeekerProfile = await JobSeekerProfile.findOne({ userId });

//     if (!jobSeekerProfile) {
//       return res.status(400).json({
//         status: false,
//         message: "Please complete your job seeker profile first.",
//       });
//     }

//     const body = req.body;

//     if (!body || (Array.isArray(body) && body.length === 0)) {
//       return res.status(400).json({
//         status: false,
//         message: "No education data provided.",
//       });
//     }

//     const educationsToAdd = Array.isArray(body) ? body : [body];

    
//     const sanitizedEducations = educationsToAdd.map((edu) => ({
//       userId,
//       jobSeekerId: jobSeekerProfile._id,
//       degree: edu.degree?.trim() === "" ? null : edu.degree ?? null,
//       boardOfUniversity: edu.boardOfUniversity?.trim() === "" ? null : edu.boardOfUniversity ?? null,
//       sessionFrom: edu.sessionFrom?.trim?.() === "" ? null : edu.sessionFrom ?? null,
//       sessionTo: edu.sessionTo?.trim?.() === "" ? null : edu.sessionTo ?? null,
//       marks: edu.marks?.trim() === "" ? null : edu.marks ?? null,
//       gradeOrPercentage: edu.gradeOrPercentage?.trim() === "" ? null : edu.gradeOrPercentage ?? null,
//     }));

//     await JobSeekerEducation.insertMany(sanitizedEducations);

//     res.status(201).json({
//       status: true,
//       message: "Education records saved successfully.",
//     });
//   } catch (error) {
//     console.error("Error saving education:", error);
//     res.status(500).json({
//       status: false,
//       message: "Server error.",
//       error: error.message,
//     });
//   }
// };

exports.getMyEducation = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view education records.",
      });
    }

    // Pagination params
    const pageRaw  = parseInt(req.query.page, 10);
    const limitRaw = parseInt(req.query.limit, 10);
    const page  = Number.isFinite(pageRaw)  && pageRaw  > 0 ? pageRaw  : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 5; // cap to 50
    const skip  = (page - 1) * limit;

    // Exclude soft-deleted docs
    const filter = { userId, isDeleted: { $ne: true } };

    // Count first
    const totalRecord = await JobSeekerEducation.countDocuments(filter);
    const totalPage   = totalRecord === 0 ? 0 : Math.ceil(totalRecord / limit);

    // Fetch page
    const educations = await JobSeekerEducation.find(filter)
      .sort({ sessionFrom: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Format helper for DD-MM-YYYY
    const fmt = (d) => {
      if (!d) return null;
      const nd = new Date(d);
      const dd = String(nd.getUTCDate()).padStart(2, "0");
      const mm = String(nd.getUTCMonth() + 1).padStart(2, "0");
      const yy = nd.getUTCFullYear();
      return `${dd}-${mm}-${yy}`;
    };

    const data = educations.map((edu) => ({
      id: edu._id,
      degree: edu.degree,
      boardOfUniversity: edu.boardOfUniversity,
      sessionFrom: fmt(edu.sessionFrom),
      sessionTo: fmt(edu.sessionTo),
      marks: edu.marks,
      gradeOrPercentage: edu.gradeOrPercentage,
    }));

    return res.status(200).json({
      status: true,
      message: totalRecord ? "Education list fetched successfully." : "No education records found.",
      totalRecord,
      totalPage,
      currentPage: page,
      data,
    });

  } catch (err) {
    console.error("Error fetching educations:", err);
    return res.status(500).json({
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

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view education records.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(educationId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid education ID format.",
      });
    }

    // Fetch the record (don't filter isDeleted here; we need to detect it)
    const education = await JobSeekerEducation.findOne({
      _id: educationId,
      userId,
    }).lean();

    if (!education) {
      return res.status(404).json({
        status: false,
        message: "Education record not found.",
      });
    }

    // If soft deleted, return a specific status code & message
    if (education.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This education record has been soft deleted and cannot be viewed.",
      });
      // If you prefer 400/409 instead:
      // return res.status(400).json({ status:false, message:"This education record is already soft deleted." });
      // or
      // return res.status(409).json({ status:false, message:"This education record is already soft deleted." });
    }

    // Format helper DD-MM-YYYY
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const yy = d.getUTCFullYear();
      return `${dd}-${mm}-${yy}`;
    };

    const formatted = {
      id: education._id,
      degree: education.degree,
      boardOfUniversity: education.boardOfUniversity,
      sessionFrom: formatDate(education.sessionFrom),
      sessionTo: formatDate(education.sessionTo),
      marks: education.marks,
      gradeOrPercentage: education.gradeOrPercentage,
    };

    return res.status(200).json({
      status: true,
      message: "Education record fetched successfully.",
      data: formatted,
    });
  } catch (err) {
    console.error("Error fetching education by ID:", err);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message,
    });
  }
};


exports.updateEducationById = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { educationId, ...updateFields } = req.body;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can update education records.",
      });
    }

    if (!educationId || !mongoose.Types.ObjectId.isValid(educationId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid or missing education ID.",
      });
    }

    // Fetch doc (including isDeleted)
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

    // Block edits on soft-deleted records
    if (education.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This education record is already soft deleted and cannot be updated.",
      });
    }

    // Allowed fields
    const allowedFields = [
      "degree",
      "boardOfUniversity",
      "sessionFrom",
      "sessionTo",
      "marks",
      "gradeOrPercentage",
    ];

    // Date parser: accepts DD-MM-YYYY or YYYY-MM-DD or ISO
    const parseDate = (raw) => {
      if (raw == null) return raw; // allow null to clear
      const s = String(raw).trim();
      if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
        const [dd, mm, yyyy] = s.split("-");
        return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return new Date(`${s}T00:00:00.000Z`);
      }
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    // Build updates; track if anything to change
    let changed = false;
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(updateFields, field)) {
        let val = updateFields[field];
        if (field === "sessionFrom" || field === "sessionTo") {
          if (val !== undefined) {
            const parsed = parseDate(val);
            if (val !== null && parsed === null) {
              return res.status(400).json({
                status: false,
                message: `Invalid date for ${field}. Use DD-MM-YYYY or YYYY-MM-DD.`,
              });
            }
            val = parsed; // may be Date or null
          }
        }
        education[field] = val; // allow nulls to clear
        changed = true;
      }
    }

    if (!changed) {
      return res.status(400).json({
        status: false,
        message: "No valid fields provided to update.",
      });
    }

    // Optional: consistency check if both dates present
    if (education.sessionFrom && education.sessionTo) {
      if (education.sessionFrom > education.sessionTo) {
        return res.status(400).json({
          status: false,
          message: "sessionFrom cannot be after sessionTo.",
        });
      }
    }

    await education.save();

    const formatDate = (date) =>
      date ? new Date(date).toLocaleDateString("en-GB").split("/").join("-") : null;

    return res.status(200).json({
      status: true,
      message: "Education record updated successfully.",
      data: {
        id: education._id,
        degree: education.degree,
        boardOfUniversity: education.boardOfUniversity,
        sessionFrom: formatDate(education.sessionFrom),
        sessionTo: formatDate(education.sessionTo),
        marks: education.marks,
        gradeOrPercentage: education.gradeOrPercentage,
      },
    });
  } catch (err) {
    console.error("Error updating education:", err);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message,
    });
  }
};


// exports.updateEducationById = async (req, res) => {
//   try {
//     const { userId, role } = req.user;
//     const { educationId, ...updateFields } = req.body;

//     if (role !== "job_seeker") {
//       return res.status(403).json({
//         status: false,
//         message: "Only job seekers can update education records.",
//       });
//     }

//     if (!educationId || !mongoose.Types.ObjectId.isValid(educationId)) {
//       return res.status(400).json({
//         status: false,
//         message: "Invalid or missing education ID.",
//       });
//     }

//     const education = await JobSeekerEducation.findOne({
//       _id: educationId,
//       userId,
//     });

//     if (!education) {
//       return res.status(404).json({
//         status: false,
//         message: "Education record not found.",
//       });
//     }

   
//     const allowedFields = [
//       "degree",
//       "boardOfUniversity",
//       "sessionFrom",
//       "sessionTo",
//       "marks",
//       "gradeOrPercentage",
//     ];

//     allowedFields.forEach((field) => {
//       if (updateFields[field] !== undefined) {
//         education[field] = updateFields[field];
//       }
//     });

//     await education.save();

   
//     const formatDate = (date) =>
//       date ? new Date(date).toLocaleDateString("en-GB").split("/").join("-") : null;

//     res.status(200).json({
//       status: true,
//       message: "Education record updated successfully.",
//       data: {
//         id: education._id,
//         degree: education.degree,
//         boardOfUniversity: education.boardOfUniversity,
//         sessionFrom: formatDate(education.sessionFrom),
//         sessionTo: formatDate(education.sessionTo),
//         marks: education.marks,
//         gradeOrPercentage: education.gradeOrPercentage,
//       },
//     });
//   } catch (err) {
//     console.error("Error updating education:", err);
//     res.status(500).json({
//       status: false,
//       message: "Server error.",
//       error: err.message,
//     });
//   }
// };


exports.deleteEducationById = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { educationId } = req.body;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can delete education records.",
      });
    }

    if (!educationId || !mongoose.Types.ObjectId.isValid(educationId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid or missing education ID.",
      });
    }

    // Fetch first to check current state
    const existing = await JobSeekerEducation
      .findOne({ _id: educationId, userId })
      .select("_id isDeleted");

    if (!existing) {
      return res.status(404).json({
        status: false,
        message: "Education record not found or unauthorized.",
      });
    }

    if (existing.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This education record is already soft deleted.",
      });
    }

    // Perform soft delete
    await JobSeekerEducation.updateOne(
      { _id: educationId, userId },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );

    return res.status(200).json({
      status: true,
      message: "Education record deleted successfully (soft delete).",
    });
  } catch (err) {
    console.error("Error deleting education:", err);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message,
    });
  }
};


// exports.deleteEducationById = async (req, res) => {
//   try {
//     const { userId, role } = req.user;
//     const { educationId } = req.body;

//     if (role !== "job_seeker") {
//       return res.status(403).json({
//         status: false,
//         message: "Only job seekers can delete education records.",
//       });
//     }

//     if (!educationId || !mongoose.Types.ObjectId.isValid(educationId)) {
//       return res.status(400).json({
//         status: false,
//         message: "Invalid or missing education ID.",
//       });
//     }

   
//     const education = await JobSeekerEducation.findOneAndUpdate(
//       { _id: educationId, userId },
//       { $set: { isDeleted: true } },
//       { new: true }
//     );

//     if (!education) {
//       return res.status(404).json({
//         status: false,
//         message: "Education record not found or unauthorized.",
//       });
//     }

//     res.status(200).json({
//       status: true,
//       message: "Education record deleted successfully (soft delete).",
//     });
//   } catch (err) {
//     console.error("Error deleting education:", err);
//     res.status(500).json({
//       status: false,
//       message: "Server error.",
//       error: err.message,
//     });
//   }
// };

