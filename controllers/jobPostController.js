const JobPost = require("../models/JobPost");
const CompanyProfile = require("../models/CompanyProfile");
const IndustryType = require("../models/AdminIndustry");
const Category = require("../models/AdminCategory");
const StateCity = require("../models/StateCity");

const SalaryType = require("../models/AdminSalaryType");
const JobType = require("../models/AdminJobType");
const Experience = require("../models/AdminExperienceRange");     
const OtherField = require("../models/AdminOtherField");

const mongoose = require("mongoose");


// Return "X day(s) ago)" — minutes/hours ignored
const daysAgo = (date) => {
  if (!date) return null;
  const d = new Date(date);
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()); // 00:00 of created day
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 00:00 today
  const diffDays = Math.max(0, Math.floor((startOfToday - startOfDate) / 86400000));
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
};


const escapeRegex = (str = "") =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


exports.createJobPost = async (req, res) => {
  try {
    const userId = req.user.userId;

    // employer must have a company profile
    const company = await CompanyProfile.findOne({ userId });
    if (!company) {
      return res.status(400).json({
        status: false,
        message: "Company profile not found for this user. Please create a company profile first."
      });
    }

    // read NAMES from body (not ids)
    const {
      category,
      industryType,
      salaryType,
      jobType,
      state,
      experience,
      otherField,

      jobTitle,
      jobDescription,
      skills,
      minSalary,
      maxSalary,
      displayPhoneNumber,
      displayEmail,
      hourlyRate,
      expiredDate
    } = req.body || {};

    // quick required checks
    const required = { category, industryType, salaryType, jobType, state, experience, otherField };
    for (const [k, v] of Object.entries(required)) {
      if (!v || !String(v).trim()) {
        return res.status(400).json({ status: false, message: `${k} is required` });
      }
    }

    // simple validations
    if (minSalary != null && maxSalary != null && Number(minSalary) > Number(maxSalary)) {
      return res.status(400).json({ status: false, message: "minSalary cannot be greater than maxSalary." });
    }
    if (displayPhoneNumber && !/^[0-9]{8,15}$/.test(displayPhoneNumber)) {
      return res.status(400).json({ status: false, message: "Invalid displayPhoneNumber format." });
    }
    if (displayEmail && !/.+\@.+\..+/.test(displayEmail)) {
      return res.status(400).json({ status: false, message: "Invalid displayEmail format." });
    }

    // lookups by exact name (simple)
    const [
      categoryDoc,
      industryTypeDoc,
      salaryTypeDoc,
      jobTypeDoc,
      stateDoc,
      experienceDoc,
      otherFieldDoc
    ] = await Promise.all([
      Category.findOne({ name: category }),
      IndustryType.findOne({ name: industryType }),
      SalaryType.findOne({ name: salaryType, isDeleted: false }),
      JobType.findOne({ name: jobType, isDeleted: false }),
      StateCity.findOne({ state }),
      Experience.findOne({ name: experience, isDeleted: false }), // change to ExperienceRange if that's your model
      OtherField.findOne({ name: otherField, isDeleted: false })
    ]);

    if (!categoryDoc)     return res.status(400).json({ status: false, message: "Invalid category name." });
    if (!industryTypeDoc) return res.status(400).json({ status: false, message: "Invalid industry type name." });
    if (!salaryTypeDoc)   return res.status(400).json({ status: false, message: "Invalid or deleted salary type name." });
    if (!jobTypeDoc)      return res.status(400).json({ status: false, message: "Invalid or deleted job type name." });
    if (!stateDoc)        return res.status(400).json({ status: false, message: "Invalid state name." });
    if (!experienceDoc)   return res.status(400).json({ status: false, message: "Invalid or deleted experience name." });
    if (!otherFieldDoc)   return res.status(400).json({ status: false, message: "Invalid or deleted other field name." });

    // expiry (+30 days default)
    let expiry = expiredDate ? new Date(expiredDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (isNaN(expiry.getTime())) {
      return res.status(400).json({ status: false, message: "Invalid expiredDate." });
    }

    // create job (save ObjectIds)
    const jobPost = await JobPost.create({
      userId,
      companyId: company._id,
      category: categoryDoc._id,
      industryType: industryTypeDoc._id,
      salaryType: salaryTypeDoc._id,
      jobType: jobTypeDoc._id,
      state: stateDoc._id,
      experience: experienceDoc._id,
      otherField: otherFieldDoc._id,

      jobTitle,
      jobDescription,
      skills,
      minSalary,
      maxSalary,
      displayPhoneNumber,
      displayEmail,
      hourlyRate,
      expiredDate: expiry,
      status: "active" // schema will keep isApplied=false by default
    });

    const formattedExpiredDate = jobPost.expiredDate.toISOString().split("T")[0];

    return res.status(201).json({
      status: true,
      message: "Job post created successfully.",
      data: {
        _id: jobPost._id,
        userId: jobPost.userId,
        companyId: jobPost.companyId,

        // return friendly names (you sent names; ids saved internally)
        category: categoryDoc.name,
        industryType: industryTypeDoc.name,
        state: stateDoc.state,
        salaryType: salaryTypeDoc.name,
        jobType: jobTypeDoc.name,
        experience: experienceDoc.name,
        otherField: otherFieldDoc.name,

        jobTitle: jobPost.jobTitle,
        jobDescription: jobPost.jobDescription,
        skills: jobPost.skills,
        minSalary: jobPost.minSalary,
        maxSalary: jobPost.maxSalary,
        displayPhoneNumber: jobPost.displayPhoneNumber,
        displayEmail: jobPost.displayEmail,
        hourlyRate: jobPost.hourlyRate,
        status: jobPost.status,
        expiredDate: formattedExpiredDate,
        jobPosted: daysAgo(jobPost.createdAt)
      }
    });

  } catch (error) {
    console.error("Error creating job post:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to create job post.",
      error: error.message
    });
  }
};


exports.getAllJobPosts = async (req, res) => {
  try {
    const { userId, role } = req.user;

    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 100);
    const skip  = (page - 1) * limit;

    // Base filter: don't show soft-deleted posts
    const filter = { isDeleted: false };

    // Employers see only their own posts; everyone else sees all
    if (role === "employer") filter.userId = userId;

    // (Optional) If you want job seekers to see only active posts, uncomment:
    // if (role === "job_seeker") filter.status = "active";

    const totalRecord = await JobPost.countDocuments(filter);
    const totalPage   = Math.ceil(totalRecord / limit) || 0;

    const jobPosts = await JobPost.find(filter)
      .populate({ path: "companyId",    select: "companyName image" })
      .populate({ path: "userId",       select: "phoneNumber role" }) // your User schema has phoneNumber
      .populate({ path: "category",     select: "name" })
      .populate({ path: "industryType", select: "name" })
      .populate({ path: "salaryType",   select: "name" })
      .populate({ path: "jobType",      select: "name" })
      .populate({ path: "experience",   select: "name" })
      .populate({ path: "otherField",   select: "name" })
      .populate({ path: "state",        select: "state" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const data = jobPosts.map((job) => ({
      _id: job._id,

      company:       job.companyId?.companyName ?? null,
      companyImage:  job.companyId?.image ?? null,

      category:      job.category?.name ?? null,
      industryType:  job.industryType?.name ?? null,
      salaryType:    job.salaryType?.name ?? null,
      jobType:       job.jobType?.name ?? null,
      experience:    job.experience?.name ?? null,
      otherField:    job.otherField?.name ?? null,

      jobTitle:           job.jobTitle ?? null,
      jobDescription:     job.jobDescription ?? null,
      skills:             job.skills ?? null,
      minSalary:          job.minSalary ?? null,
      maxSalary:          job.maxSalary ?? null,
      displayPhoneNumber: job.displayPhoneNumber ?? null,
      displayEmail:       job.displayEmail ?? null,

      state:        job.state?.state ?? null,
      hourlyRate:   job.hourlyRate ?? null,
      status:       job.status ?? null,
      isApplied:    !!job.isApplied,
      isDeleted: !!job.isDeleted,

      expiredDate:  job.expiredDate ? job.expiredDate.toISOString().split("T")[0] : null,
      createdAt:    job.createdAt,
      updatedAt:    job.updatedAt,
      jobPosted:    daysAgo(job.createdAt),
    }));

    return res.status(200).json({
      status: true,
      message: "Job posts fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
      data,
    });
  } catch (error) {
    console.error("Error fetching job posts:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch job posts.",
      error: error.message,
    });
  }
};



exports.getJobPostById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate id format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: false,
        message: "Invalid job post ID format."
      });
    }

    let jobPost = await JobPost.findById(id)
      .select("-updatedAt -__v")
      .populate({ path: "companyId",    select: "companyName image" })
      .populate({ path: "category",     select: "name" })
      .populate({ path: "industryType", select: "name" })
      .populate({ path: "salaryType",   select: "name" })
      .populate({ path: "jobType",      select: "name" })
      .populate({ path: "experience",   select: "name" })
      .populate({ path: "otherField",   select: "name" })
      .populate({ path: "state",        select: "state" });

    if (!jobPost) {
      return res.status(404).json({
        status: false,
        message: "Job post not found."
      });
    }

    // If soft-deleted, block access with 400
    if (jobPost.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This job post has been already soft deleted."
      });
    }

    // Auto-mark expired if needed (compare by date only)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (jobPost.expiredDate && jobPost.expiredDate < today && jobPost.status !== "expired") {
      jobPost.status = "expired";
      await jobPost.save();
    }

    // Helper for "x days ago"
    const daysAgo = (d) => {
      if (!d) return null;
      const oneDay = 24 * 60 * 60 * 1000;
      const diff = Math.floor((Date.now() - new Date(d).getTime()) / oneDay);
      if (diff <= 0) return "today";
      if (diff === 1) return "1 day ago";
      return `${diff} days ago`;
    };

    // Build clean response with friendly names
    const data = {
      _id: jobPost._id,

      company:      jobPost.companyId?.companyName ?? null,
      companyImage: jobPost.companyId?.image ?? null,

      category:     jobPost.category?.name ?? null,
      industryType: jobPost.industryType?.name ?? null,
      salaryType:   jobPost.salaryType?.name ?? null,
      jobType:      jobPost.jobType?.name ?? null,
      experience:   jobPost.experience?.name ?? null,
      otherField:   jobPost.otherField?.name ?? null,
      state:        jobPost.state?.state ?? null,

      jobTitle:           jobPost.jobTitle ?? null,
      jobDescription:     jobPost.jobDescription ?? null,
      skills:             jobPost.skills ?? null,
      minSalary:          jobPost.minSalary ?? null,
      maxSalary:          jobPost.maxSalary ?? null,
      displayPhoneNumber: jobPost.displayPhoneNumber ?? null,
      displayEmail:       jobPost.displayEmail ?? null,
      hourlyRate:         jobPost.hourlyRate ?? null,

      status:      jobPost.status,
      isApplied:   !!jobPost.isApplied,
      expiredDate: jobPost.expiredDate
        ? jobPost.expiredDate.toISOString().split("T")[0]
        : null,

      createdAt: jobPost.createdAt,
      jobPosted: daysAgo(jobPost.createdAt)
    };

    return res.status(200).json({
      status: true,
      message: "Job post fetched successfully.",
      data
    });

  } catch (error) {
    console.error("Error fetching job post by ID:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch job post.",
      error: error.message
    });
  }
};

exports.getAllJobPostsPublic = async (req, res) => {
  try {
    const page  = parseInt(req.query.page, 10)  || 1;
    const limit = parseInt(req.query.limit, 10) || 5;
    const skip  = (page - 1) * limit;

    const { jobTitle, state } = req.query;

    // 1) Build filter (only non-deleted; you can also enforce status:'active' if you want)
    const filter = { isDeleted: false };

    // jobTitle: case-insensitive contains
    if (jobTitle && jobTitle.trim()) {
      filter.jobTitle = { $regex: escapeRegex(jobTitle.trim()), $options: "i" };
    }

    // state by human name (StateCity.state)
    if (state && state.trim()) {
      const stateRegex = { $regex: escapeRegex(state.trim()), $options: "i" };
      const states = await StateCity.find({ state: stateRegex }).select("_id");
      const stateIds = states.map(s => s._id);
      if (stateIds.length === 0) {
        return res.status(200).json({
          status: true,
          message: "Job posts fetched successfully.",
          totalRecord: 0,
          totalPage: 0,
          currentPage: page,
          data: []
        });
      }
      filter.state = { $in: stateIds };
    }

    // 2) Count for pagination
    const totalRecord = await JobPost.countDocuments(filter);
    const totalPage   = Math.ceil(totalRecord / limit);

    // 3) Query (keep createdAt; exclude updatedAt/__v)
    const jobPosts = await JobPost.find(filter)
      .select("-updatedAt -__v")
      .populate({ path: "companyId",    select: "companyName image" })
      .populate({ path: "category",     select: "name" })
      .populate({ path: "industryType", select: "name" })
      .populate({ path: "salaryType",   select: "name" })
      .populate({ path: "jobType",      select: "name" })
      .populate({ path: "experience",   select: "name" })
      .populate({ path: "otherField",   select: "name" })
      .populate({ path: "state",        select: "state" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // 4) Shape response
    const data = jobPosts.map(j => ({
      _id: j._id,

      company:      j.companyId?.companyName ?? null,
      companyImage: j.companyId?.image ?? null,

      category:     j.category?.name ?? null,
      industryType: j.industryType?.name ?? null,
      salaryType:   j.salaryType?.name ?? null,
      jobType:      j.jobType?.name ?? null,
      experience:   j.experience?.name ?? null,
      otherField:   j.otherField?.name ?? null,
      state:        j.state?.state ?? null,

      jobTitle:           j.jobTitle ?? null,
      jobDescription:     j.jobDescription ?? null,
      skills:             j.skills ?? null,
      minSalary:          j.minSalary ?? null,
      maxSalary:          j.maxSalary ?? null,
      displayPhoneNumber: j.displayPhoneNumber ?? null,
      displayEmail:       j.displayEmail ?? null,
      hourlyRate:         j.hourlyRate ?? null,

      status: j.status,
      expiredDate: j.expiredDate ? new Date(j.expiredDate).toISOString().split("T")[0] : null,
      jobPosted: daysAgo(j.createdAt)
    }));

    // 5) Respond
    return res.status(200).json({
      status: true,
      message: "Job posts fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
      data
    });

  } catch (error) {
    console.error("Error fetching job posts:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch job posts.",
      error: error.message
    });
  }
};



exports.updateJobPostById = async (req, res) => {
  try {
    const { id, category, industryType, state, expiredDate, status, ...updateData } = req.body;
    const { userId } = req.user;

    // Validate ID
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: false, message: "Valid job post ID is required." });
    }

    // Load post
    const jobPost = await JobPost.findById(id);
    if (!jobPost) {
      return res.status(404).json({ status: false, message: "Job post not found." });
    }

    // Ownership check
    if (jobPost.userId.toString() !== userId.toString()) {
      return res.status(403).json({ status: false, message: "You are not authorized to update this job post." });
    }

    // ⛔ Block updates to soft-deleted posts
    if (jobPost.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This job post has been soft deleted and cannot be updated."
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Update allowed fields only
    const restrictedFields = ["_id", "userId", "companyId", "__v", "isDeleted", "deletedAt"];
    Object.keys(updateData).forEach((field) => {
      if (!restrictedFields.includes(field)) {
        jobPost[field] = updateData[field];
      }
    });

    // Resolve category by name (optional)
    if (category) {
      const categoryDoc = await Category.findOne({ name: category });
      if (!categoryDoc) return res.status(400).json({ status: false, message: "Invalid category name." });
      jobPost.category = categoryDoc._id;
    }

    // Resolve industryType by name (optional)
    if (industryType) {
      const industryTypeDoc = await IndustryType.findOne({ name: industryType });
      if (!industryTypeDoc) return res.status(400).json({ status: false, message: "Invalid industry type name." });
      jobPost.industryType = industryTypeDoc._id;
    }

    // Resolve state by name (optional)
    if (state) {
      const stateDoc = await StateCity.findOne({ state });
      if (!stateDoc) return res.status(400).json({ status: false, message: "Invalid state name." });
      jobPost.state = stateDoc._id;
    }

    // Expiry logic
    if (expiredDate) {
      // Expecting "YYYY-MM-DD"
      const [year, month, day] = expiredDate.split("-");
      const formattedExpiry = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

      if (isNaN(formattedExpiry.getTime())) {
        return res.status(400).json({ status: false, message: "Invalid expiredDate format. Use YYYY-MM-DD." });
      }

      jobPost.expiredDate = formattedExpiry;
      jobPost.markModified("expiredDate");

      jobPost.status = formattedExpiry < today ? "expired" : "active";
    } else {
      // Default to +30 days if not provided
      const defaultExpiry = new Date();
      defaultExpiry.setDate(defaultExpiry.getDate() + 30);
      defaultExpiry.setHours(0, 0, 0, 0);
      jobPost.expiredDate = defaultExpiry;
      jobPost.markModified("expiredDate");
      jobPost.status = "active";
    }

    // Manual status override (if no expiredDate change provided)
    if (status && !expiredDate) {
      if (status === "active" && jobPost.status === "expired") {
        return res.status(400).json({
          status: false,
          message: "You cannot set this job back to active without updating expiry date to a future date."
        });
      }
      jobPost.status = status;
    }

    await jobPost.save();

    // Re-fetch populated
    const populatedJobPost = await JobPost.findById(jobPost._id)
      .populate("category", "name")
      .populate("industryType", "name")
      .populate("state", "state")
      .lean();

    populatedJobPost.category = populatedJobPost.category?.name || null;
    populatedJobPost.industryType = populatedJobPost.industryType?.name || null;
    populatedJobPost.state = populatedJobPost.state?.state || null;

    if (populatedJobPost.expiredDate) {
      populatedJobPost.expiredDate = new Date(populatedJobPost.expiredDate).toISOString().split("T")[0];
    }

    // Helpers
    const createdAtFromObjectId = (oid) => {
      try {
        return new Date(parseInt(String(oid).substring(0, 8), 16) * 1000);
      } catch {
        return null;
      }
    };
    const daysAgo = (d) => {
      if (!d) return null;
      const oneDay = 24 * 60 * 60 * 1000;
      const diff = Math.floor((Date.now() - new Date(d).getTime()) / oneDay);
      if (diff <= 0) return "today";
      if (diff === 1) return "1 day ago";
      return `${diff} days ago`;
    };

    const createdAt = populatedJobPost.createdAt || createdAtFromObjectId(populatedJobPost._id);
    populatedJobPost.jobPosted = daysAgo(createdAt);

    return res.status(200).json({
      status: true,
      message: "Job post updated successfully.",
      data: populatedJobPost
    });

  } catch (error) {
    console.error("Error updating job post:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to update job post.",
      error: error.message
    });
  }
};

exports.updateJobPostStatus = async (req, res) => {
  try {
    const { id, status } = req.body;
    const { userId } = req.user;

    if (!id) {
      return res.status(400).json({
        status: false,
        message: "Job post ID is required."
      });
    }

   
    const jobPost = await JobPost.findById(id);

    if (!jobPost) {
      return res.status(404).json({
        status: false,
        message: "Job post not found."
      });
    }

    
    if (jobPost.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to update this job post status."
      });
    }

    const currentDate = new Date();

   
    if (jobPost.expiredDate && currentDate > jobPost.expiredDate) {
      jobPost.status = "expired";
      await jobPost.save();

      return res.status(400).json({
        status: false,
        message: "Job post is already expired. You cannot update its status."
      });
    }

   
    if (status === "expired") {
      return res.status(400).json({
        status: false,
        message: "You cannot manually set status to 'expired'. It is set automatically based on expired date."
      });
    }

   
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        status: false,
        message: "Invalid status value. Allowed values: 'active', 'inactive'."
      });
    }

    jobPost.status = status;
    await jobPost.save();

   
    const populatedJobPost = await JobPost.findById(jobPost._id)
      .populate("category", "name")
      .populate("industryType", "name")
      .populate("state", "state") 
      .lean();

   
    populatedJobPost.category = populatedJobPost.category?.name || null;
    populatedJobPost.industryType = populatedJobPost.industryType?.name || null;
    populatedJobPost.state = populatedJobPost.state?.state || null;

   
    if (populatedJobPost.expiredDate) {
  populatedJobPost.expiredDate = new Date(populatedJobPost.expiredDate)
    .toISOString()
    .split("T")[0];
}

    return res.status(200).json({
      status: true,
      message: `Job post marked as ${status} successfully.`,
      data: populatedJobPost
    });

  } catch (error) {
    console.error("Error updating job post status:", error);
    res.status(500).json({
      status: false,
      message: "Failed to update job post status.",
      error: error.message
    });
  }
};


exports.deleteJobPostById = async (req, res) => {
  try {
    const { id } = req.body; 
    const { userId, role } = req.user;

   
    if (!id) {
      return res.status(400).json({
        status: false,
        message: "Job post ID is required."
      });
    }

    
    const jobPost = await JobPost.findOne({ _id: id, isDeleted: false });

    if (!jobPost) {
      return res.status(404).json({
        status: false,
        message: "Job post is already deleted."
      });
    }

   
    if (role !== "admin" && jobPost.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to delete this job post."
      });
    }

   
    jobPost.isDeleted = true;
    jobPost.status = "expired";
    jobPost.expiredDate = new Date();

    await jobPost.save();

    return res.status(200).json({
      status: true,
      message: "Job post deleted successfully (soft delete).",
    
    });

  } catch (error) {
    console.error("Error deleting job post:", error);
    res.status(500).json({
      status: false,
      message: "Failed to delete job post.",
      error: error.message
    });
  }
};

//get job details by job post id without token
exports.getJobDetailsPublic = async (req, res) => {
  try {
    const { id } = req.params;

    // fetch job by id (non-deleted only)
    let jobPost = await JobPost.findOne({ _id: id, isDeleted: false })
      .select("-updatedAt -__v")
      .populate({ path: "companyId",    select: "companyName image aboutCompany" })
      .populate({ path: "category",     select: "name" })
      .populate({ path: "industryType", select: "name" })
      .populate({ path: "salaryType",   select: "name" })
      .populate({ path: "jobType",      select: "name" })
      .populate({ path: "experience",   select: "name" })
      .populate({ path: "otherField",   select: "name" })
      .populate({ path: "state",        select: "state" });

    if (!jobPost) {
      return res.status(404).json({ status: false, message: "Job post not found." });
    }

    // auto-mark expired
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (jobPost.expiredDate && jobPost.expiredDate < today && jobPost.status !== "expired") {
      jobPost.status = "expired";
      await jobPost.save();
    }

    const data = {
      _id: jobPost._id,

      company:        jobPost.companyId?.companyName ?? null,
      companyImage:   jobPost.companyId?.image ?? null,
      aboutCompany:   jobPost.companyId?.aboutCompany ?? null,

      category:       jobPost.category?.name ?? null,
      industryType:   jobPost.industryType?.name ?? null,
      salaryType:     jobPost.salaryType?.name ?? null,
      jobType:        jobPost.jobType?.name ?? null,
      experience:     jobPost.experience?.name ?? null,
      otherField:     jobPost.otherField?.name ?? null,
      state:          jobPost.state?.state ?? null,

      jobTitle:           jobPost.jobTitle ?? null,
      jobDescription:     jobPost.jobDescription ?? null,
      skills:             jobPost.skills ?? null,
      minSalary:          jobPost.minSalary ?? null,
      maxSalary:          jobPost.maxSalary ?? null,
      displayPhoneNumber: jobPost.displayPhoneNumber ?? null,
      displayEmail:       jobPost.displayEmail ?? null,
      hourlyRate:         jobPost.hourlyRate ?? null,

      status:      jobPost.status,
      isApplied:   !!jobPost.isApplied,
      expiredDate: jobPost.expiredDate ? jobPost.expiredDate.toISOString().split("T")[0] : null,

      createdAt: jobPost.createdAt,
      jobPosted: daysAgo(jobPost.createdAt)
    };

    return res.status(200).json({
      status: true,
      message: "Job details fetched successfully.",
      data
    });

  } catch (error) {
    console.error("Error fetching job post by ID (public):", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch job details.",
      error: error.message
    });
  }
};
