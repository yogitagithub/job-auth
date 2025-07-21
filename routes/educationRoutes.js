const express = require("express");
const router = express.Router();
const { createEducation, getMyEducation, getEducationById, updateEducationById, deleteEducationById } = require('../controllers/educationController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-education', verifyToken, createEducation);
router.get('/get-education', verifyToken, getMyEducation);
router.get("/get-education/:educationId", verifyToken, getEducationById);
router.put('/update-education/:educationId', verifyToken, updateEducationById);
router.delete('/delete-education/:educationId', verifyToken, deleteEducationById);


module.exports = router;
