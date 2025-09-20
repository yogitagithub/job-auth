const express = require("express");
const router = express.Router();
const { uploadTask, updateTask } = require('../controllers/taskController');
const { verifyToken } = require('../middleware/authMiddleware');

//task upload by job seeker
router.post('/upload-task', verifyToken, uploadTask);

//updating task by employer
router.put('/update-task', verifyToken, updateTask);
 


module.exports = router;
