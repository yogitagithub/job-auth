const express = require("express");
const router = express.Router();
const { uploadTask, updateTask, updatedTaskDetails } = require('../controllers/taskController');
const { verifyToken } = require('../middleware/authMiddleware');

//task upload by job seeker
router.post('/upload-task', verifyToken, uploadTask);

//updating task by employer
router.put('/update-task', verifyToken, updateTask);

//details of updated task view by employer and job seeker
router.get('/updated-task-details/:jobApplicationId', verifyToken, updatedTaskDetails);

 


module.exports = router;
