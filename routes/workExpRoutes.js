const express = require("express");
const router = express.Router();
const { createWorkExp, getMyWorkExp, getWorkExperienceById, updateWorkExperienceById, deleteWorkExperienceById } = require('../controllers/workExpController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-workExp', verifyToken, createWorkExp);
 router.get('/get-workExp', verifyToken, getMyWorkExp);
 router.get('/get-workExp/:experienceId', verifyToken, getWorkExperienceById);
 router.put('/update-workExp/:experienceId', verifyToken, updateWorkExperienceById);
 router.delete('/delete-workExp/:experienceId', verifyToken, deleteWorkExperienceById);


module.exports = router;
