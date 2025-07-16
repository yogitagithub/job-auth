const express = require("express");
const router = express.Router();
const { uploadResume, deleteResume } = require('../controllers/resumeController');
const { verifyToken } = require('../middleware/authMiddleware');
const upload = require("../middleware/upload");


router.post('/upload-resume', verifyToken,  upload.single("resume"), uploadResume);
 router.delete('/delete-resume', verifyToken, deleteResume);


module.exports = router;
