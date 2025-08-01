const express = require("express");
const router = express.Router();
const { applyJobs, getMyApplications, updateStatus, updateEmployerApprovalStatus  } = require('../controllers/applyJobController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/apply-job', verifyToken, applyJobs);
router.get('/getAll-appliedJobs', verifyToken, getMyApplications);
router.put('/update-status/:applicationId/status', verifyToken, updateStatus );
router.put("/:applicationId/employer-approval", verifyToken, updateEmployerApprovalStatus);


module.exports = router;
