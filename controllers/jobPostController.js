const JobPost = require("../models/JobPost");
const CompanyProfile = require("../models/CompanyProfile");

exports.createJobPost = async (req, res) => {
  try {
   
    const company = await CompanyProfile.findOne({ userId: req.user.userId });

    if (!company) {
      return res.status(400).json({
        success: false,
        message: "Company profile not found for this user. Please create a company profile first."
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
    const jobPosts = await JobPost.find()
      .populate("companyId")  
      .populate("userId", "mobile role") 
      .sort({ createdAt: -1 }); 

    res.json({
      success: true,
      count: jobPosts.length,
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
      .populate("userId", "mobile role");

    if (!jobPost) {
      return res.status(404).json({
        success: false,
        message: "Job post not found."
      });
    }

    res.json({
      success: true,
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