const Review = require("../models/Review");
const CompanyProfile = require("../models/CompanyProfile");
const JobSeekerProfile = require("../models/JobSeekerProfile");

exports.createOrUpdateReview = async (req, res) => {
  try {
    const { userId, role } = req.user; 
    const { jobSeekerId, employerId, rating, comment } = req.body;

   
    if (role === "employer") {
      if (!jobSeekerId) {
        return res.status(400).json({
          status: false,
          message: "Job seeker ID is required for employer reviews.",
        });
      }
    } 
    else if (role === "job_seeker") {
      if (!employerId) {
        return res.status(400).json({
          status: false,
          message: "Employer ID is required for job seeker reviews.",
        });
      }
    }

   
    const reviewData = {
      userId,
      rating,
      comment,
      reviewFor: role === "employer" ? "job_seeker" : "employer",
      jobSeekerId: role === "employer" ? jobSeekerId : undefined,
      employerId: role === "job_seeker" ? employerId : undefined,
    };

   
    const filter =
      role === "employer"
        ? { userId, jobSeekerId }
        : { userId, employerId };

    const review = await Review.findOneAndUpdate(filter, reviewData, {
      new: true,
      upsert: true, 
    });

    res.status(200).json({
      status: true,
      message: "Review submitted successfully.",
      data: review,
    });
  } catch (error) {
    console.error("Error creating review:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

exports.getReviews = async (req, res) => {
  try {
    const { userId, role } = req.user;  

    let filter = {};
    let populateOptions = [];

    if (role === "employer") {
     
      const employerProfile = await CompanyProfile.findOne({ userId });

      if (!employerProfile) {
        return res.status(404).json({
          status: false,
          message: "Employer profile not found.",
        });
      }

      filter = { reviewFor: "employer", employerId: employerProfile._id };

      populateOptions = [
        { path: "userId", select: "name email role" }, 
      ];
    } 
    else if (role === "job_seeker") {
    
      const jobSeekerProfile = await JobSeekerProfile.findOne({ userId });

      if (!jobSeekerProfile) {
        return res.status(404).json({
          status: false,
          message: "Job seeker profile not found.",
        });
      }

      filter = { reviewFor: "job_seeker", jobSeekerId: jobSeekerProfile._id };

      populateOptions = [
        { path: "userId", select: "name email role" }, 
      ];
    } 
    else {
      return res.status(403).json({
        status: false,
        message: "Invalid role.",
      });
    }

  
    const reviews = await Review.find(filter)
      .populate(populateOptions)
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};


exports.deleteReview = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { reviewId } = req.params;

    if (role !== "job_seeker") {
      return res.status(403).json({ status: false, message: "Only job seekers can delete reviews." });
    }

    const review = await Review.findOneAndDelete({ _id: reviewId, userId });

    if (!review) {
      return res.status(404).json({ status: false, message: "Review not found or unauthorized." });
    }

    res.status(200).json({ status: true, message: "Review deleted successfully." });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error.", error: error.message });
  }
};
