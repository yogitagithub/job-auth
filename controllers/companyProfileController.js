const CompanyProfile = require("../models/CompanyProfile");
const JobPost = require("../models/JobPost");

exports.saveProfile = async (req, res) => {
  try {
    const { phoneNumber, ...updateFields } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        status: false,
        message: "phoneNumber is required to find the profile"
      });
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({
        status: false,
        message: "No fields to update"
      });
    }

   
    let profile = await CompanyProfile.findOne({ phoneNumber });

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "From this phoneNumber number, role has not been selected."
      });
    }

    
    Object.keys(updateFields).forEach(field => {
      profile[field] = updateFields[field];
    });

    await profile.save();

    return res.json({
      status: true,
      message: "Company profile updated successfully",
      data: profile
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: false,
      message: "Server error",
      error: error.message
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can view company profiles."
      });
    }

    const profile = await CompanyProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found."
      });
    }

    return res.json({
      status: true,
      message: "Company profile fetched successfully.",
      data: profile
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};


exports.createJobPost = async (req, res) => {
  try {
    // 1️⃣ Get the company profile for this user
    const company = await CompanyProfile.findOne({ userId: req.user.userId });

    if (!company) {
      return res.status(400).json({
        success: false,
        message: "Company profile not found for this user. Please create a company profile first."
      });
    }

    // 2️⃣ Create a new JobPost document
    const jobPost = new JobPost({
      ...req.body,
      companyId: company._id, // link to company
      userId: req.user.userId // link to user
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
      .populate("companyId")   // Get linked company profile
      .populate("userId", "mobile role") // Optionally get user details (only mobile & role)
      .sort({ createdAt: -1 }); // Most recent first

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




