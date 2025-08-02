const express = require("express");
const router = express.Router();
const { createReview, getCompanyReviews, updateReview, deleteReview } = require('../controllers/reviewController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post("/create-review", verifyToken, createReview);
router.get("/get-review", verifyToken, getCompanyReviews);
router.put("/update-review", verifyToken, updateReview);
router.delete("/delete-review", verifyToken, deleteReview);

module.exports = router;
