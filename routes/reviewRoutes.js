const express = require("express");
const router = express.Router();
const { createReview, getCompanyReviews, updateReview, deleteReview } = require('../controllers/reviewController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post("/create-review", verifyToken, createReview);
router.get("/:companyId", verifyToken, getCompanyReviews);
router.put("/:reviewId", verifyToken, updateReview);
router.delete("/:reviewId", verifyToken, deleteReview);

module.exports = router;
