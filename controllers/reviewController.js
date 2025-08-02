const Review = require("../models/Review");
const CompanyProfile = require("../models/CompanyProfile");

exports.createReview = async (req, res) => {
  try {
    const { userId, role } = req.user; // From auth middleware
    const { companyId, rating, comment } = req.body;

    if (role !== "job_seeker") {
      return res.status(403).json({ status: false, message: "Only job seekers can add reviews." });
    }

    // Check if company exists
    const company = await CompanyProfile.findById(companyId);
    if (!company) {
      return res.status(404).json({ status: false, message: "Company not found." });
    }

    // Create review
    const review = await Review.create({
      userId,
      companyId,
      rating,
      comment,
    });

    res.status(201).json({
      status: true,
      message: "Review added successfully.",
      data: review,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ status: false, message: "You already reviewed this company." });
    }
    console.error("Error adding review:", error);
    res.status(500).json({ status: false, message: "Server error.", error: error.message });
  }
};

// Fetch reviews for a company
exports.getCompanyReviews = async (req, res) => {
  try {
    const { companyId } = req.params;

    const reviews = await Review.find({ companyId })
      .populate("userId", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error.", error: error.message });
  }
};

// Update review
exports.updateReview = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { reviewId } = req.params;
    const { rating, comment } = req.body;

    if (role !== "job_seeker") {
      return res.status(403).json({ status: false, message: "Only job seekers can update reviews." });
    }

    const review = await Review.findOne({ _id: reviewId, userId });

    if (!review) {
      return res.status(404).json({ status: false, message: "Review not found or unauthorized." });
    }

    review.rating = rating || review.rating;
    review.comment = comment || review.comment;
    await review.save();

    res.status(200).json({ status: true, message: "Review updated successfully.", data: review });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error.", error: error.message });
  }
};

// Delete review
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
