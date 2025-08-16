const JobPost = require("../models/JobPost");
const CompanyProfile = require("../models/CompanyProfile");
const IndustryType = require("../models/AdminIndustry");
const Category = require("../models/AdminCategory");
const StateCity = require("../models/StateCity");


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
    const company = await CompanyProfile.findOne({ userId: req.user.userId });

    if (!company) {
      return res.status(400).json({
        status: false,
        message: "Company profile not found for this user. Please create a company profile first."
      });
    }

   
    const category = await Category.findOne({ name: req.body.category });
    if (!category) {
      return res.status(400).json({ status: false, message: "Invalid category name." });
    }

   
    const industryType = await IndustryType.findOne({ name: req.body.industryType });
    if (!industryType) {
      return res.status(400).json({ status: false, message: "Invalid industry type name." });
    }

   
    const state = await StateCity.findOne({ state: req.body.state });
    if (!state) {
      return res.status(400).json({ status: false, message: "Invalid state name." });
    }

   
    let expiredDate = req.body.expiredDate
      ? new Date(req.body.expiredDate)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

   
    const jobPost = new JobPost({
      ...req.body,
      expiredDate,
      status: "active",
      state: state._id,
      category: category._id,
      industryType: industryType._id,
      companyId: company._id,
      userId: req.user.userId
    });

    await jobPost.save();

   
    const formattedExpiredDate = jobPost.expiredDate.toISOString().split("T")[0];

   
    res.status(201).json({
      status: true,
      message: "Job post created successfully.",
      data: {
        _id: jobPost._id,
        userId: jobPost.userId,
        companyId: jobPost.companyId,
        jobTitle: jobPost.jobTitle,
        jobDescription: jobPost.jobDescription,
        salaryType: jobPost.salaryType,
        displayPhoneNumber: jobPost.displayPhoneNumber,
        minSalary: jobPost.minSalary,
        maxSalary: jobPost.maxSalary,
        status: jobPost.status,
        experience: jobPost.experience,
        jobType: jobPost.jobType,
        skills: jobPost.skills,
        category: category.name,
        industryType: industryType.name,
        state: state.state,
        expiredDate: formattedExpiredDate,
        //  aboutCompany: jobPost.aboutCompany ?? null,
         jobPosted: daysAgo(jobPost.createdAt)
      }
    });

  } catch (error) {
    console.error("Error creating job post:", error);
    res.status(500).json({
      status: false,
      message: "Failed to create job post.",
      error: error.message
    });
  }
};

exports.getAllJobPosts = async (req, res) => {
  try {
    const { userId, role } = req.user;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    const filter = role === 'employer' ? { userId } : {};

    const totalRecord = await JobPost.countDocuments(filter);
    const totalPage = Math.ceil(totalRecord / limit);

    const jobPosts = await JobPost.find(filter)
      .populate("companyId")
      .populate("userId", "mobile role")
      .populate("category", "name")
      .populate("industryType", "name")
      .populate("state", "state") 
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const transformedJobPosts = jobPosts.map(job => ({
      _id: job._id,
      company: job.companyId?.companyName || null,
      companyImage: job.companyId?.image || null,
      category: job.category?.name || null,
      industryType: job.industryType?.name || null,
      jobTitle: job.jobTitle,
      jobDescription: job.jobDescription,
      salaryType: job.salaryType,
      displayPhoneNumber: job.displayPhoneNumber,
      displayEmail: job.displayEmail,
      jobType: job.jobType,
      skills: job.skills,
      minSalary: job.minSalary,
      maxSalary: job.maxSalary,
      state: job.state?.state || null,
      experience: job.experience,
      otherField: job.otherField,
      status: job.status,
      expiredDate: job.expiredDate ? job.expiredDate.toISOString().split("T")[0] : null,
      isDeleted: job.isDeleted,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
       jobPosted: daysAgo(job.createdAt)
    }));

    res.status(200).json({
      status: true,
      message: "Job posts fetched successfully.",
      totalRecord,
      totalPage,
      data: transformedJobPosts
    });

  } catch (error) {
    console.error("Error fetching job posts:", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch job posts.",
      error: error.message
    });
  }
};

exports.getJobPostById = async (req, res) => {
  try {
    const { id } = req.params;

    let jobPost = await JobPost.findById(id)
      .select("-updatedAt -__v")
      .populate("companyId", "companyName")
      .populate("category", "name")
      .populate("industryType", "name")
      .populate("state", "state");

    if (!jobPost) {
      return res.status(404).json({
        status: false,
        message: "Job post not found."
      });
    }

   
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (jobPost.expiredDate && jobPost.expiredDate < today && jobPost.status !== "expired") {
      jobPost.status = "expired";
      await jobPost.save();
    }

    const jobData = jobPost.toObject();

   
    delete jobData.userId;
    delete jobData.companyId;

    
    if (jobPost.category) jobData.category = jobPost.category.name;
    if (jobPost.industryType) jobData.industryType = jobPost.industryType.name;
    if (jobPost.state) jobData.state = jobPost.state.state; 

   
    jobData.expiredDate = jobPost.expiredDate
      ? jobPost.expiredDate.toISOString().split("T")[0]
      : null;

      jobData.jobPosted = daysAgo(jobPost.createdAt);

    res.json({
      status: true,
      message: "Job post fetched successfully.",
      data: jobData
    });

  } catch (error) {
    console.error("Error fetching job post by ID:", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch job post.",
      error: error.message
    });
  }
};

exports.updateJobPostById = async (req, res) => {
  try {
    const { id, category, industryType, state, expiredDate, status, ...updateData } = req.body;
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
        message: "You are not authorized to update this job post."
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

   
    const restrictedFields = ["_id", "userId", "companyId", "__v"];
    Object.keys(updateData).forEach((field) => {
      if (!restrictedFields.includes(field)) {
        jobPost[field] = updateData[field];
      }
    });

   
    if (category) {
      const categoryDoc = await Category.findOne({ name: category });
      if (!categoryDoc) {
        return res.status(400).json({ status: false, message: "Invalid category name." });
      }
      jobPost.category = categoryDoc._id;
    }

   
    if (industryType) {
      const industryTypeDoc = await IndustryType.findOne({ name: industryType });
      if (!industryTypeDoc) {
        return res.status(400).json({ status: false, message: "Invalid industry type name." });
      }
      jobPost.industryType = industryTypeDoc._id;
    }

   
    if (state) {
      const stateDoc = await StateCity.findOne({ state: state });
      if (!stateDoc) {
        return res.status(400).json({ status: false, message: "Invalid state name." });
      }
      jobPost.state = stateDoc._id;
    }

   
    if (expiredDate) {
  const [year, month, day] = expiredDate.split("-");
  const formattedExpiry = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

      jobPost.expiredDate = formattedExpiry;
      jobPost.markModified("expiredDate");

   
      if (formattedExpiry < today) {
        jobPost.status = "expired";
      } else {
        jobPost.status = "active";
      }
    } else {
      
      const defaultExpiry = new Date();
      defaultExpiry.setDate(defaultExpiry.getDate() + 30);
      defaultExpiry.setHours(0, 0, 0, 0);
      jobPost.expiredDate = defaultExpiry;
      jobPost.markModified("expiredDate");
      jobPost.status = "active";
    }

  
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

    //add this: compute "X days ago" from createdAt
const createdAt = populatedJobPost.createdAt || createdAtFromObjectId(populatedJobPost._id);
populatedJobPost.jobPosted = daysAgo(createdAt);

    res.json({
      status: true,
      message: "Job post updated successfully.",
      data: populatedJobPost
    });

  } catch (error) {
    console.error("Error updating job post:", error);
    res.status(500).json({
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


exports.getAllJobPostsPublic = async (req, res) => {
  try {
    const page  = parseInt(req.query.page, 10)  || 1;
    const limit = parseInt(req.query.limit, 10) || 5;
    const skip  = (page - 1) * limit;

    const { jobTitle, state } = req.query;

    // 1) Build filter
    const filter = {};

    // jobTitle: case-insensitive contains
    if (jobTitle && jobTitle.trim()) {
      filter.jobTitle = { $regex: escapeRegex(jobTitle.trim()), $options: "i" };
    }

    // state (by name in StateCity)
    if (state && state.trim()) {
      const stateNameRegex = { $regex: escapeRegex(state.trim()), $options: "i" };
      const matchingStates = await StateCity.find({ state: stateNameRegex }).select("_id");
      const stateIds = matchingStates.map(s => s._id);

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

    // 3) Query: don't even fetch createdAt/updatedAt/__v
    const jobPosts = await JobPost.find(filter)
      .select("-updatedAt -__v")                       // <-- exclude here
      .populate({ path: "companyId", select: "companyName image" })
      .populate("category", "name")
      .populate("industryType", "name")
      .populate("state", "state")
      .sort({ createdAt: -1 })   // sort still works; uses index, not projection
      .skip(skip)
      .limit(limit)
      .lean();

    // 4) Clean/flatten output (timestamps are already excluded)
    const data = jobPosts.map(j => ({
      _id: j._id,
      company: j.companyId?.companyName ?? null,
      companyImage: j.companyId?.image ?? null,
      category: j.category?.name ?? null,
      industryType: j.industryType?.name ?? null,
      jobTitle: j.jobTitle,
      jobDescription: j.jobDescription,
      salaryType: j.salaryType,
      displayPhoneNumber: j.displayPhoneNumber,
      displayEmail: j.displayEmail,
      jobType: j.jobType,
      skills: j.skills,
      minSalary: j.minSalary,
      maxSalary: j.maxSalary,
      state: j.state?.state ?? null,
      experience: j.experience,
      otherField: j.otherField,
      status: j.status,
      expiredDate: j.expiredDate,     // keep as ISO string from DB; format if needed
      isDeleted: j.isDeleted,
       jobPosted: daysAgo(j.createdAt) 
    }));

    // 5) Respond
    res.status(200).json({
      status: true,
      message: "Job posts fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
      data
    });

  } catch (error) {
    console.error("Error fetching job posts:", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch job posts.",
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
        message: "Job post not found or already deleted."
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


