const express = require("express");
const router = express.Router();
const { applyJobs, withdrawApplication, getApplicantsForJob, getMyApplications, getApprovedApplicants, updateEmployerApprovalStatus  } = require('../controllers/applyJobController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/apply-job', verifyToken, applyJobs);
router.get('/applicants/:jobPostId', verifyToken, getApplicantsForJob);
router.put('/withdraw-application', verifyToken, withdrawApplication);

router.get('/getAll-appliedJobs', verifyToken, getMyApplications);
router.put("/:applicationId/employer-approval", verifyToken, updateEmployerApprovalStatus);
router.get("/approved-applicants", verifyToken, getApprovedApplicants);

module.exports = router;
