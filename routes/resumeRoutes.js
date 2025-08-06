const express = require("express");
const router = express.Router();
const { createResume, deleteResume } = require('../controllers/resumeController');
const { verifyToken } = require('../middleware/authMiddleware');
const uploadResume = require("../middleware/uploadResume");


router.post('/upload-resume', verifyToken,  uploadResume.single("resume"), createResume);
router.delete('/delete-resume', verifyToken, deleteResume);

module.exports = router;
