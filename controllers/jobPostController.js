const JobPost = require("../models/JobPost");
const CompanyProfile = require("../models/CompanyProfile");
const IndustryType = require("../models/AdminIndustry");
const Category = require("../models/AdminCategory");

exports.createJobPost = async (req, res) => {
  try {
    const company = await CompanyProfile.findOne({ userId: req.user.userId });

    if (!company) {
      return res.status(400).json({
        success: false,
        message: "Company profile not found for this user. Please create a company profile first."
      });
    }

   
    const category = await Category.findOne({ name: req.body.category });
    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Invalid category name. Please select a valid category.",
      });
    }

   
    const industryType = await IndustryType.findOne({ name: req.body.industryType });
    if (!industryType) {
      return res.status(400).json({
        success: false,
        message: "Invalid industry type name. Please select a valid industry type.",
      });
    }

   
    const jobPost = new JobPost({
      ...req.body,
      category: category._id,
      industryType: industryType._id,
      companyId: company._id,
      userId: req.user.userId
    });

    await jobPost.save();

    const populatedJobPost = await JobPost.findById(jobPost._id)
      .populate("category", "name")
      .populate("industryType", "name")
      .lean(); 

   
    populatedJobPost.category = populatedJobPost.category?.name || null;
    populatedJobPost.industryType = populatedJobPost.industryType?.name || null;


    res.status(201).json({
      status: true,
      message: "Job post created successfully.",
      data: populatedJobPost
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
      experience: job.experience,
      otherField: job.otherField,
      status: job.status,
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
      success: false,
      message: "Failed to fetch job posts.",
      error: error.message
    });
  }
};

exports.getJobPostById = async (req, res) => {
  try {
    const { id } = req.params;

    const jobPost = await JobPost.findById(id)
      .select("-createdAt -updatedAt -__v") // remove unnecessary fields
      .populate("companyId", "companyName") // only used to retrieve if needed temporarily
      .populate("category", "name")
      .populate("industryType", "name");

    if (!jobPost) {
      return res.status(404).json({
        success: false,
        message: "Job post not found."
      });
    }

    const jobData = jobPost.toObject();

    // Remove userId and companyId completely
    delete jobData.userId;
    delete jobData.companyId;

    // Convert category and industryType to string
    if (jobPost.category) jobData.category = jobPost.category.name;
    if (jobPost.industryType) jobData.industryType = jobPost.industryType.name;

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


// exports.getJobPostById = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const jobPost = await JobPost.findById(id)
//       .populate("companyId")
//       .populate("userId", "mobile role")
//       .populate("category", "name")
//       .populate("industryType", "name");

//     if (!jobPost) {
//       return res.status(404).json({
//         success: false,
//         message: "Job post not found."
//       });
//     }

//     res.json({
//       status: true,
//     message: "Job post fetched successfully.",
//       data: jobPost
//     });
//   } catch (error) {
//     console.error("Error fetching job post by ID:", error);
//     res.status(500).json({
//       status: false,
//       message: "Failed to fetch job post.",
//       error: error.message
//     });
//   }
// };

exports.updateJobPostById = async (req, res) => {
  try {
    const { id, category, industryType, ...updateData } = req.body;
    const { userId } = req.user;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Job post ID is required."
      });
    }

  
    const jobPost = await JobPost.findById(id);
    if (!jobPost) {
      return res.status(404).json({
        success: false,
        message: "Job post not found."
      });
    }

    
    if (jobPost.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this job post."
      });
    }

 
    const restrictedFields = ["_id", "userId", "companyId", "__v"];
    Object.keys(updateData).forEach((field) => {
      if (!restrictedFields.includes(field)) {
        jobPost[field] = updateData[field];
      }
    });

  
    if (category) {
      const categoryDoc = await Category.findOne({ name: category });
      if (!categoryDoc) {
        return res.status(400).json({
          success: false,
          message: "Invalid category name. Please select a valid category.",
        });
      }
      jobPost.category = categoryDoc._id;
    }

   
    if (industryType) {
      const industryTypeDoc = await IndustryType.findOne({ name: industryType });
      if (!industryTypeDoc) {
        return res.status(400).json({
          success: false,
          message: "Invalid industry type name. Please select a valid industry type.",
        });
      }
      jobPost.industryType = industryTypeDoc._id;
    }

    await jobPost.save();


    const populatedJobPost = await JobPost.findById(jobPost._id)
      .populate("category", "name")
      .populate("industryType", "name")
      .lean();

    populatedJobPost.category = populatedJobPost.category?.name || null;
    populatedJobPost.industryType = populatedJobPost.industryType?.name || null;

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
    const { id, status } = req.body; // ✅ ID and status from body
    const { userId } = req.user;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Job post ID is required."
      });
    }

    if (!['expired', 'closed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value. Allowed values: 'expired', 'closed'."
      });
    }

    const jobPost = await JobPost.findById(id);

    if (!jobPost) {
      return res.status(404).json({
        success: false,
        message: "Job post not found."
      });
    }

    if (jobPost.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this job post status."
      });
    }

    jobPost.status = status;
    await jobPost.save();

    return res.status(200).json({
      success: true,
      message: `Job post marked as ${status} successfully.`,
      data: jobPost
    });

  } catch (error) {
    console.error("Error updating job post status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update job post status.",
      error: error.message
    });
  }
};



// exports.updateJobPostById = async (req, res) => {
//   try {
//     const { id } = req.body;
//     const { userId } = req.user;

//     if (!id) {
//       return res.status(400).json({
//         success: false,
//         message: "Job post ID is required."
//       });
//     }

//     const jobPost = await JobPost.findById(id);

//     if (!jobPost) {
//       return res.status(404).json({
//         success: false,
//         message: "Job post not found."
//       });
//     }

//     // Check if the logged-in user owns the job post
//     if (jobPost.userId.toString() !== userId.toString()) {
//       return res.status(403).json({
//         success: false,
//         message: "You are not authorized to update this job post."
//       });
//     }

//     // Restrict specific fields from updating
//     const restrictedFields = ["_id", "userId", "companyId", "__v"];
//     Object.keys(req.body).forEach((field) => {
//       if (restrictedFields.includes(field)) return;
//       jobPost[field] = req.body[field];
//     });

//     await jobPost.save();

//     res.json({
//       success: true,
//       message: "Job post updated successfully.",
//       data: jobPost
//     });
//   } catch (error) {
//     console.error("Error updating job post:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to update job post.",
//       error: error.message
//     });
//   }
// };


// exports.updateJobPostById = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { userId } = req.user;

  
//     const jobPost = await JobPost.findById(id);

//     if (!jobPost) {
//       return res.status(404).json({
//         success: false,
//         message: "Job post not found."
//       });
//     }

   
//     if (jobPost.userId.toString() !== userId.toString()) {
//       return res.status(403).json({
//         success: false,
//         message: "You are not authorized to update this job post."
//       });
//     }

    
//     const restrictedFields = ["_id", "userId", "companyId", "__v"];
//     Object.keys(req.body).forEach((field) => {
//       if (restrictedFields.includes(field)) return;
//       jobPost[field] = req.body[field];
//     });

//     await jobPost.save();

//     res.json({
//       success: true,
//       message: "Job post updated successfully.",
//       data: jobPost
//     });
//   } catch (error) {
//     console.error("Error updating job post:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to update job post.",
//       error: error.message
//     });
//   }
// };

// exports.updateJobPostStatus = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const { status } = req.body;

//     if (!['expired', 'closed'].includes(status)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid status value. Allowed values: 'expired', 'closed'."
//       });
//     }

//     const jobPost = await JobPost.findById(id);

//     if (!jobPost) {
//       return res.status(404).json({
//         success: false,
//         message: "Job post not found."
//       });
//     }

//     if (jobPost.userId.toString() !== userId.toString()) {
//       return res.status(403).json({
//         success: false,
//         message: "You are not authorized to update this job post status."
//       });
//     }

//     jobPost.status = status;
//     await jobPost.save();

//     return res.status(200).json({
//       success: true,
//       message: `Job post marked as ${status} successfully.`,
//       data: jobPost
//     });

//   } catch (error) {
//     console.error("Error updating job post status:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to update job post status.",
//       error: error.message
//     });
//   }
// };


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

