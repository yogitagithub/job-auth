const express = require("express");
const router = express.Router();
const { createOrUpdateReview, getReviews, deleteReview } = require('../controllers/reviewController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post("/create-review", verifyToken, createOrUpdateReview);
router.get("/get-review", verifyToken, getReviews);

router.delete("/delete-review", verifyToken, deleteReview);

module.exports = router;
