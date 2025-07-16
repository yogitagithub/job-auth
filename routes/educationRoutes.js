const express = require("express");
const router = express.Router();
const { createEducation, getMyEducation, updateEducation, deleteEducation } = require('../controllers/educationController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-education', verifyToken, createEducation);
router.get('/get-education', verifyToken, getMyEducation);
router.put('/update-education', verifyToken, updateEducation);
router.delete('/delete-education', verifyToken, deleteEducation);


module.exports = router;
