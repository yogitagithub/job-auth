const express = require("express");
const router = express.Router();

const { uploadTask, updateTask, updatedTaskDetails, 
    updateTaskPayment, getMyTasks, getApprovedTasks, getPaymentsList, getPaymentDetails, 
    getApprovedCandidatePayment, getSeekerPaymentHistory, getTasks } = require('../controllers/taskController');

const { verifyToken } = require('../middleware/authMiddleware');
const uploadCertificate = require("../middleware/uploadCertificate");

//task upload by job seeker

router.post("/upload-task", verifyToken, uploadCertificate.single("file"), uploadTask);


//get all the task with applicationId
router.get("/my-tasks/:applicationId", verifyToken, getMyTasks);


//get all the task without applicationId

router.get("/my-tasks", verifyToken, getTasks);


//get only approved task
router.get("/approvedTasks/:applicationId", verifyToken, getApprovedTasks); 



//updating task by employer
router.put('/update-task', verifyToken, updateTask);

//details of updated task view by employer and job seeker
router.get('/updated-task-details/:jobApplicationId', verifyToken, updatedTaskDetails);

 //update isPaid field by employer only
 router.put("/task-payment/:jobApplicationId", verifyToken, updateTaskPayment);

 //payment history
 router.get("/payments", verifyToken, getPaymentsList);


 //candidate list of payments
 router.get("/approvedCandidatePayment", verifyToken, getApprovedCandidatePayment);

 //job seeker payment history
 router.get("/paymentHistory", verifyToken, getSeekerPaymentHistory);

 //payment details
router.get("/paymentDetails/:jobApplicationId", verifyToken, getPaymentDetails);








module.exports = router;
