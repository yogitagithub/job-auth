const express = require("express");
const router = express.Router();
const { uploadTask, updateTask, updatedTaskDetails, updateTaskPayment, getMyTasks, getApprovedTasks } = require('../controllers/taskController');
const { verifyToken } = require('../middleware/authMiddleware');
const uploadCertificate = require("../middleware/uploadCertificate");

//task upload by job seeker

router.post("/upload-task", verifyToken, uploadCertificate.single("file"), uploadTask);


//get all the task 
router.get("/my-tasks/:applicationId", verifyToken, getMyTasks);


//get only approved task
router.get("/approvedTasks/:applicationId", verifyToken, getApprovedTasks); 



//updating task by employer
router.put('/update-task', verifyToken, updateTask);

//details of updated task view by employer and job seeker
router.get('/updated-task-details/:jobApplicationId', verifyToken, updatedTaskDetails);

 //update isPaid field by employer only
 router.put("/task-payment/:taskId", verifyToken, updateTaskPayment);



module.exports = router;
