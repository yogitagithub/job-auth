const JobPost = require("../models/JobPost");
const CompanyProfile = require("../models/CompanyProfile");
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

     const categoryExists = await Category.findById(req.body.category);
    if (!categoryExists) {
      return res.status(400).json({
        success: false,
        message: "Invalid category. Please select a valid category.",
      });
    }
 
    const jobPost = new JobPost({
      ...req.body,
      companyId: company._id, 
      userId: req.user.userId 
    });

    await jobPost.save();

    res.status(201).json({
      success: true,
      message: "Job post created successfully.",
      data: jobPost
    });
  } catch (error) {
    console.error("Error creating job post:", error);
    res.status(500).json({
      success: false,
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
      .limit(limit); 

    // res.json({
    //   success: true,
    //    message: "All job posts have been fetched successfully.",
    //   count: jobPosts.length,
    //   data: jobPosts
    // });


     res.status(200).json({
      success: true,
      message: "Job posts fetched successfully.",
      // count: jobPosts.length,
      totalRecord,
      totalPage,
       data: jobPosts
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
      .populate("companyId")
      .populate("userId", "mobile role")
      .populate("category", "name")
      .populate("industryType", "name");

    if (!jobPost) {
      return res.status(404).json({
        success: false,
        message: "Job post not found."
      });
    }

    res.json({
      success: true,
    message: "Job post fetched successfully.",
      data: jobPost
    });
  } catch (error) {
    console.error("Error fetching job post by ID:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch job post.",
      error: error.message
    });
  }
};

exports.updateJobPostById = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

  
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
    Object.keys(req.body).forEach((field) => {
      if (restrictedFields.includes(field)) return;
      jobPost[field] = req.body[field];
    });

    await jobPost.save();

    res.json({
      success: true,
      message: "Job post updated successfully.",
      data: jobPost
    });
  } catch (error) {
    console.error("Error updating job post:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update job post.",
      error: error.message
    });
  }
};