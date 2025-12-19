const WorkExperience = require("../models/WorkExperience");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const mongoose = require("mongoose");




exports.createWorkExp = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { userId, role } = req.user || {};

    if (role !== "job_seeker") {
      return res.status(403).json({ status: false, message: "Only job seekers can add their work experience." });
    }

    const jobSeekerProfile = await JobSeekerProfile.findOne({ userId }).session(session);
    if (!jobSeekerProfile) {
      return res.status(400).json({ status: false, message: "Please complete your job seeker profile first." });
    }

    const body = req.body;
    if (!body || (Array.isArray(body) && body.length === 0)) {
      return res.status(400).json({ status: false, message: "No experience data provided." });
    }

    const experiencesToAdd = Array.isArray(body) ? body : [body];

    const sanitizedExperiences = experiencesToAdd.map((exp) => ({
      userId,
      jobSeekerId: jobSeekerProfile._id,
      companyName: (exp.companyName?.trim?.() || null),
      jobTitle: (exp.jobTitle?.trim?.() || null),
      sessionFrom: (exp.sessionFrom?.trim?.() || null),
      sessionTo: (exp.sessionTo?.trim?.() || null),
      roleDescription: (exp.roleDescription?.trim?.() || null),
      // add other fields as per your schema
    }));

    await session.withTransaction(async () => {
      // 1) create experiences
      await WorkExperience.insertMany(sanitizedExperiences, { session });

      // 2) flip flags on the profile
      await JobSeekerProfile.updateOne(
        { _id: jobSeekerProfile._id, isDeleted: false },
        { $set: { isExperienceAdded: true, isExperienced: true } }, // isExperienced optional; remove if you don’t want it auto-set
        { session }
      );
    });

    return res.status(201).json({ status: true, message: "Work experience records saved successfully." });
  } catch (error) {
    console.error("Error saving work experience:", error);
    return res.status(500).json({ status: false, message: "Server error.", error: error.message });
  } finally {
    session.endSession();
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

    // Pagination params
    const pageRaw  = parseInt(req.query.page, 10);
    const limitRaw = parseInt(req.query.limit, 10);
    const page  = Number.isFinite(pageRaw)  && pageRaw  > 0 ? pageRaw  : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 5; // cap 50
    const skip  = (page - 1) * limit;

    // Exclude soft-deleted
    const filter = { userId, isDeleted: { $ne: true } };

    // Count and fetch
    const totalRecord = await WorkExperience.countDocuments(filter);
    const totalPage   = totalRecord === 0 ? 0 : Math.ceil(totalRecord / limit);

    const experiences = await WorkExperience.find(filter)
      .sort({ sessionFrom: -1, _id: -1 }) // newest first
      .skip(skip)
      .limit(limit)
      .lean();

    // Format DD-MM-YYYY
    const fmt = (d) => {
      if (!d) return null;
      const nd = new Date(d);
      const dd = String(nd.getUTCDate()).padStart(2, "0");
      const mm = String(nd.getUTCMonth() + 1).padStart(2, "0");
      const yy = nd.getUTCFullYear();
      return `${dd}-${mm}-${yy}`;
    };

    const data = experiences.map((exp) => ({
      id: exp._id,
      companyName: exp.companyName,
      jobTitle: exp.jobTitle,
      sessionFrom: fmt(exp.sessionFrom),
      sessionTo: fmt(exp.sessionTo),
      roleDescription: exp.roleDescription,
    }));

    return res.status(200).json({
      status: true,
      message: totalRecord ? "Work-experience list fetched successfully." : "No work-experience records found.",
      totalRecord,
      totalPage,
      currentPage: page,
      data,
    });
  } catch (err) {
    console.error("Error fetching work experiences:", err);
    return res.status(500).json({
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

    // Fetch without filtering isDeleted so we can detect soft-deleted state
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

    // If soft-deleted, block access with 400
    if (experience.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This work experience has been deleted and cannot be viewed.",
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

    return res.status(200).json({
      status: true,
      message: "Work experience fetched successfully.",
      data: formatted,
    });
  } catch (err) {
    console.error("Error fetching work experience:", err);
    return res.status(500).json({
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

    // Fetch doc so we can check soft-delete state
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

    // ⛔ Block edits on soft-deleted records
    if (experience.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This work experience has been deleted and cannot be updated.",
      });
    }

    const allowedFields = [
      "companyName",
      "jobTitle",
      "sessionFrom",
      "sessionTo",
      "roleDescription",
    ];

    // Optional: parse dates if strings are passed (DD-MM-YYYY or YYYY-MM-DD or ISO)
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

    let changed = false;
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(updateFields, field)) {
        let value = updateFields[field];

        // convert empty strings to null
        if (typeof value === "string" && value.trim() === "") value = null;

        if (field === "sessionFrom" || field === "sessionTo") {
          if (value !== undefined) {
            const parsed = parseDate(value);
            if (value !== null && parsed === null) {
              return res.status(400).json({
                status: false,
                message: `Invalid date for ${field}. Use DD-MM-YYYY or YYYY-MM-DD.`,
              });
            }
            value = parsed; // Date or null
          }
        }

        experience[field] = value;
        changed = true;
      }
    }

    if (!changed) {
      return res.status(400).json({
        status: false,
        message: "No valid fields provided to update.",
      });
    }

    // Optional: consistency check
    if (experience.sessionFrom && experience.sessionTo) {
      if (experience.sessionFrom > experience.sessionTo) {
        return res.status(400).json({
          status: false,
          message: "sessionFrom cannot be after sessionTo.",
        });
      }
    }

    await experience.save();

    // Format DD-MM-YYYY
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const day = String(d.getUTCDate()).padStart(2, "0");
      const month = String(d.getUTCMonth() + 1).padStart(2, "0");
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

    return res.status(200).json({
      status: true,
      message: "Work experience updated successfully.",
      data: formatted,
    });
  } catch (err) {
    console.error("Error updating work experience:", err);
    return res.status(500).json({
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

    // Fetch first to verify ownership and soft-delete status
    const existing = await WorkExperience
      .findOne({ _id: experienceId, userId })
      .select("_id isDeleted");

    if (!existing) {
      return res.status(404).json({
        status: false,
        message: "Work experience not found or unauthorized.",
      });
    }

    if (existing.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This work experience is already deleted.",
      });
    }

    // Soft delete
    await WorkExperience.updateOne(
      { _id: experienceId, userId },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );


      // 🔁 Recompute the flag on the profile from ground truth
    const hasRemaining = await WorkExperience.exists({
      userId,
      isDeleted: { $ne: true },
    });

     await JobSeekerProfile.updateOne(
      { userId },
      { $set: { isExperienceAdded: !!hasRemaining, isExperienced: !!hasRemaining } }
    );

    return res.status(200).json({
      status: true,
      message: "Work experience deleted successfully.",
    });
  } catch (err) {
    console.error("Error deleting work experience:", err);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: err.message,
    });
  }
};

