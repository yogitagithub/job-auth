const JobPost = require("../models/JobPost");
const CompanyProfile = require("../models/CompanyProfile");
const IndustryType = require("../models/AdminIndustry");
const Category = require("../models/AdminCategory");
const StateCity = require("../models/StateCity");

exports.createJobPost = async (req, res) => {
  try {
    const company = await CompanyProfile.findOne({ userId: req.user.userId });

    if (!company) {
      return res.status(400).json({
        status: false,
        message: "Company profile not found for this user. Please create a company profile first."
      });
    }

    // ✅ Validate Category by name
    const category = await Category.findOne({ name: req.body.category });
    if (!category) {
      return res.status(400).json({ status: false, message: "Invalid category name." });
    }

    // ✅ Validate Industry Type by name
    const industryType = await IndustryType.findOne({ name: req.body.industryType });
    if (!industryType) {
      return res.status(400).json({ status: false, message: "Invalid industry type name." });
    }

    // ✅ Validate state by name
    const state = await StateCity.findOne({ state: req.body.state });
    if (!state) {
      return res.status(400).json({ status: false, message: "Invalid state name." });
    }

    // ✅ Set expiry date (default 30 days if not provided)
    let expiredDate = req.body.expiredDate
      ? new Date(req.body.expiredDate)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // ✅ Create job post
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

    // ✅ Format expiredDate
    const formattedExpiredDate = jobPost.expiredDate.toISOString().split("T")[0];

    // ✅ Response with names instead of ObjectIds
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
        expiredDate: formattedExpiredDate
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
      // .populate("state", "state")
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

      state: job.state,

      // state: job.state?.state || null,
      experience: job.experience,
      otherField: job.otherField,
      status: job.status,
      expiredDate: job.expiredDate ? job.expiredDate.toISOString().split("T")[0] : null,
      isDeleted: job.isDeleted,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
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
      .select("-createdAt -updatedAt -__v") // Keep only the excluded fields
      .populate("companyId", "companyName")
      .populate("category", "name")
      .populate("industryType", "name");

    if (!jobPost) {
      return res.status(404).json({
        status: false,
        message: "Job post not found."
      });
    }

    // ✅ Check if expired
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (jobPost.expiredDate && jobPost.expiredDate < today && jobPost.status !== "expired") {
      jobPost.status = "expired";
      await jobPost.save();
    }

    const jobData = jobPost.toObject();

    // Remove userId and companyId completely
    delete jobData.userId;
    delete jobData.companyId;

    // Convert category and industryType to string
    if (jobPost.category) jobData.category = jobPost.category.name;
    if (jobPost.industryType) jobData.industryType = jobPost.industryType.name;

    // ✅ Ensure expiredDate is included (formatted as date)
    jobData.expiredDate = jobPost.expiredDate
      ? jobPost.expiredDate.toISOString().split("T")[0]
      : null;

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

    // Update allowed fields except restricted
    const restrictedFields = ["_id", "userId", "companyId", "__v"];
    Object.keys(updateData).forEach((field) => {
      if (!restrictedFields.includes(field)) {
        jobPost[field] = updateData[field];
      }
    });

    // Category update
    if (category) {
      const categoryDoc = await Category.findOne({ name: category });
      if (!categoryDoc) {
        return res.status(400).json({ status: false, message: "Invalid category name." });
      }
      jobPost.category = categoryDoc._id;
    }

    // Industry type update
    if (industryType) {
      const industryTypeDoc = await IndustryType.findOne({ name: industryType });
      if (!industryTypeDoc) {
        return res.status(400).json({ status: false, message: "Invalid industry type name." });
      }
      jobPost.industryType = industryTypeDoc._id;
    }

    // State update
    if (state) {
      const stateDoc = await StateCity.findOne({ state: state });
      if (!stateDoc) {
        return res.status(400).json({ status: false, message: "Invalid state name." });
      }
      jobPost.state = stateDoc._id;
    }

    // ✅ Handle expiry date update
    // if (expiredDate) {
    //   const [year, month, day] = expiredDate.split("-");
    //   const formattedExpiry = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

    //   // Compare only date parts (ignore time)
    //   const currentExpiry = new Date(jobPost.expiredDate);
    //   const currentDateStr = currentExpiry.toISOString().split("T")[0];
    //   const newDateStr = formattedExpiry.toISOString().split("T")[0];

    //   // ✅ Same date check
    //   if (newDateStr === currentDateStr) {
    //     return res.status(400).json({
    //       success: false,
    //       message: "The expiry date is the same as the current expiry date. No changes made."
    //     });
    //   }

    if (expiredDate) {
  const [year, month, day] = expiredDate.split("-");
  const formattedExpiry = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

  // Extract only date parts (ignore time)
  const currentExpiry = new Date(jobPost.expiredDate);
  const currentDateStr = currentExpiry.toISOString().split("T")[0];
  const newDateStr = formattedExpiry.toISOString().split("T")[0];

  // ✅ Same date check (strict)
  if (newDateStr === currentDateStr) {
    return res.status(400).json({
      status: false,
      message: "The expiry date is the same as the current expiry date. No changes made."
    });
  }


      // Update expiry date
      jobPost.expiredDate = formattedExpiry;
      jobPost.markModified("expiredDate");

      // Set status based on date
      if (formattedExpiry < today) {
        jobPost.status = "expired";
      } else {
        jobPost.status = "active";
      }
    } else {
      // No expiry date → set default 30 days
      const defaultExpiry = new Date();
      defaultExpiry.setDate(defaultExpiry.getDate() + 30);
      defaultExpiry.setHours(0, 0, 0, 0);
      jobPost.expiredDate = defaultExpiry;
      jobPost.markModified("expiredDate");
      jobPost.status = "active";
    }

    // Manual status update (only if no expiry date change)
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

    // Populate response
    const populatedJobPost = await JobPost.findById(jobPost._id)
      .populate("category", "name")
      .populate("industryType", "name")
      .populate("state", "state")
      .lean();

    populatedJobPost.category = populatedJobPost.category?.name || null;
    populatedJobPost.industryType = populatedJobPost.industryType?.name || null;
    populatedJobPost.state = populatedJobPost.state?.state || null;

    // Format expiredDate
    if (populatedJobPost.expiredDate) {
      populatedJobPost.expiredDate = new Date(populatedJobPost.expiredDate).toISOString().split("T")[0];
    }

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

    // Find job post
    const jobPost = await JobPost.findById(id);

    if (!jobPost) {
      return res.status(404).json({
        status: false,
        message: "Job post not found."
      });
    }

    // Authorization check
    if (jobPost.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to update this job post status."
      });
    }

    const currentDate = new Date();

    // Auto-expire if expiredDate is passed
    if (jobPost.expiredDate && currentDate > jobPost.expiredDate) {
      jobPost.status = "expired";
      await jobPost.save();

      return res.status(400).json({
        status: false,
        message: "Job post is already expired. You cannot update its status."
      });
    }

    // ❌ Prevent manual 'expired' update
    if (status === "expired") {
      return res.status(400).json({
        status: false,
        message: "You cannot manually set status to 'expired'. It is set automatically based on expired date."
      });
    }

    // ✅ Allow only active/inactive
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        status: false,
        message: "Invalid status value. Allowed values: 'active', 'inactive'."
      });
    }

    jobPost.status = status;
    await jobPost.save();

    return res.status(200).json({
      status: true,
      message: `Job post marked as ${status} successfully.`,
      data: jobPost
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
   
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    
    const totalRecord = await JobPost.countDocuments();
    const totalPage = Math.ceil(totalRecord / limit);

  
    const jobPosts = await JobPost.find()
      .populate("companyId") // Company details
      .populate("category", "name") // Only category name
      .populate("industryType", "name") // Only industry type name
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Convert to plain JS object

    // Transform response (only names for category & industryType)
    const transformedJobPosts = jobPosts.map(job => ({
      ...job,
      category: job.category?.name || null,
      industryType: job.industryType?.name || null
    }));

    res.status(200).json({
      status: true,
      message: "Job posts fetched successfully.",
      totalRecord,
      totalPage,
      currentPage: page,
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

exports.deleteJobPostById = async (req, res) => {
  try {
    const { id } = req.body; // You are passing ID in the body
    const { userId, role } = req.user;

    // Validate ID
    if (!id) {
      return res.status(400).json({
        status: false,
        message: "Job post ID is required."
      });
    }

    // Find job post which is not deleted
    const jobPost = await JobPost.findOne({ _id: id, isDeleted: false });

    if (!jobPost) {
      return res.status(404).json({
        status: false,
        message: "Job post not found or already deleted."
      });
    }

    // Check authorization (admin or creator)
    if (role !== "admin" && jobPost.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to delete this job post."
      });
    }

    // Soft delete - set isDeleted to true and expire immediately
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


