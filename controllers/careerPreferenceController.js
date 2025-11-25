const mongoose = require("mongoose");
const CareerPreference = require("../models/CareerPreference");
const Category = require("../models/AdminCategory");
const JobType = require("../models/AdminJobType");
const CurrentSalary = require("../models/AdminCurrentSalary");


const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function normalizeLocations(input) {
  if (Array.isArray(input)) {
    return [...new Set(input.map((s) => String(s || "").trim()).filter(Boolean))];
  }
  if (typeof input === "string") {
    return [...new Set(input.split(",").map((s) => s.trim()).filter(Boolean))];
  }
  return [];
}

exports.createCareer = async (req, res) => {
  try {
    const { userId, role } = req.user || {};
    if (!userId) return res.status(401).json({ status: false, message: "Unauthorized" });
    if (role !== "job_seeker") {
      return res.status(403).json({ status: false, message: "Only job seekers can create or update career preferences." });
    }
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ status: false, message: "No fields provided to create or update." });
    }

    // fetch existing preference
    let doc = await CareerPreference.findOne({ userId });

    // trying to update a soft-deleted record
    if (doc && doc.isDeleted) {
      return res.status(400).json({                 
        status: false,
        message: "Career preference is deleted and cannot be updated."
      });
    }

    const isCreate = !doc;

    // preferredLocations (required on create)
    if ("preferredLocations" in req.body) {
      const arr = normalizeLocations(req.body.preferredLocations);
      if (!arr.length) {
        return res.status(400).json({ status: false, message: "preferredLocations must have at least one location" });
      }
      req.body.preferredLocations = arr;
    } else if (isCreate) {
      return res.status(400).json({ status: false, message: "preferredLocations is required on create" });
    }

    // simple text/number fields (normalize only if provided)
    if ("jobRole" in req.body) req.body.jobRole = String(req.body.jobRole || "").trim();
    if ("highestEducation" in req.body) req.body.highestEducation = String(req.body.highestEducation || "").trim();
    if ("totalExperienceYears" in req.body) req.body.totalExperienceYears = String(req.body.totalExperienceYears ?? "0").trim();
    if ("noticePeriodDays" in req.body) req.body.noticePeriodDays = Number.isFinite(+req.body.noticePeriodDays) ? +req.body.noticePeriodDays : 0;
    if ("negotiable" in req.body) req.body.negotiable = Boolean(req.body.negotiable);

    // on create, these names are required
    const mustOnCreate = ["category", "jobType", "currentSalary"];
    for (const f of mustOnCreate) {
      if (isCreate && !String(req.body[f] || "").trim()) {
        return res.status(400).json({ status: false, message: `${f} name is required on create` });
      }
    }

    // resolve names → ObjectIds (store), keep names for response
    let categoryName, jobTypeName, currentSalaryName;

    if ("category" in req.body) {
      categoryName = String(req.body.category || "").trim();
      const categoryDoc = await Category.findOne({
        isDeleted: false,
        name: { $regex: `^${escapeRegex(categoryName)}$`, $options: "i" }
      });
      if (!categoryDoc) return res.status(404).json({ status: false, message: "Category not found" });
      req.body.category = categoryDoc._id;
      categoryName = categoryDoc.name; // normalized casing
    }

    if ("jobType" in req.body) {
      jobTypeName = String(req.body.jobType || "").trim();
      const jobTypeDoc = await JobType.findOne({
        name: { $regex: `^${escapeRegex(jobTypeName)}$`, $options: "i" },
        ...(JobType.schema.path("isDeleted") ? { isDeleted: { $ne: true } } : {})
      });
      if (!jobTypeDoc) return res.status(404).json({ status: false, message: "Job type not found" });
      req.body.jobType = jobTypeDoc._id;
      jobTypeName = jobTypeDoc.name;
    }

    if ("currentSalary" in req.body) {
      currentSalaryName = String(req.body.currentSalary || "").trim();
      const salaryDoc = await CurrentSalary.findOne({
        isDeleted: false,
        name: { $regex: `^${escapeRegex(currentSalaryName)}$`, $options: "i" }
      });
      if (!salaryDoc) return res.status(404).json({ status: false, message: "Current salary option not found" });
      req.body.currentSalary = salaryDoc._id;
      currentSalaryName = salaryDoc.name;
    }

    // create or update (partial allowed)
    const restricted = ["_id", "userId", "isDeleted", "__v", "createdAt", "updatedAt"];
    if (isCreate) {
      doc = new CareerPreference({
        userId,
        ...Object.keys(req.body).reduce((acc, k) => {
          if (!restricted.includes(k)) acc[k] = req.body[k];
          return acc;
        }, {})
      });
      await doc.save();
    } else {
      Object.keys(req.body).forEach((k) => {
        if (!restricted.includes(k)) doc[k] = req.body[k];
      });
      await doc.save();
    }

    // Build response with names (no ids shown)
    const populated = await CareerPreference.findById(doc._id)
      .populate("jobType", "name")
      .populate("currentSalary", "name")
      .populate("category", "name");

    const out = {
      ...populated.toObject(),
      jobType: jobTypeName ?? populated.jobType?.name ?? null,
      currentSalary: currentSalaryName ?? populated.currentSalary?.name ?? null,
      category: categoryName ?? populated.category?.name ?? null,
    };

    return res.status(200).json({
      status: true,
      message: `Career preference ${isCreate ? "created" : "updated"} successfully.`,
      data: out
    });
  } catch (err) {
    console.error("createCareer error:", err);
    return res.status(500).json({ status: false, message: "Server error.", error: err.message });
  }
};

exports.getMyCareer = async (req, res) => {
  try {
    const { userId, role } = req.user || {};
    if (!userId) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can access career preferences."
      });
    }

    // First fetch WITHOUT the isDeleted filter so we can distinguish cases
    let doc = await CareerPreference.findOne({ userId });

    if (!doc) {
      return res.status(404).json({
        status: false,
        message: "Career preference not found"
      });
    }

    // If it exists but is soft-deleted, tell the user explicitly
    if (doc.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "Career preference is deleted."
      });
    }

    // Populate and return names (not ObjectIds)
    await doc.populate([
      { path: "jobType",       select: "name" },
      { path: "currentSalary", select: "name" },
      { path: "category",      select: "name" }
    ]);

    const out = doc.toObject();
    out.jobType       = doc.jobType?.name || null;
    out.currentSalary = doc.currentSalary?.name || null;
    out.category      = doc.category?.name || null;
    delete out.__v;

    return res.status(200).json({
      status: true,
      message: "Career preference fetched",
      data: out
    });
  } catch (err) {
    console.error("getMyCareer error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

exports.deleteCareer = async (req, res) => {
  try {
    const { userId, role } = req.user || {};
    if (!userId) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can delete their career preference."
      });
    }

    const doc = await CareerPreference.findOne({ userId });
    if (!doc) {
      return res.status(404).json({ status: false, message: "Career preference not found" });
    }

    if (doc.isDeleted) {
      // already soft-deleted
      return res.status(400).json({
        status: false,
        message: "Career preference is already deleted."
      });
    }

    doc.isDeleted = true;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Career preference deleted successfully."
    });
  } catch (err) {
    console.error("deleteCareer error:", err);
    return res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};


