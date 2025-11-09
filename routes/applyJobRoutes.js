const express = require("express");
const router = express.Router();
const { applyJobs, withdrawApplication, getApplicantsForJob, 
    getApplicantsDetails, getMyApplications, getApprovedApplicants, 
    updateEmployerApprovalStatus, getApplicantsForEmployer, getSeekerApplicantDetails } = require('../controllers/applyJobController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/apply-job', verifyToken, applyJobs);

//with job post id
router.get('/applicants/:jobPostId', verifyToken, getApplicantsForJob);


//without job post id
router.get('/applicants', verifyToken, getApplicantsForEmployer);



router.get('/applicantsDetails/:jobPostId', verifyToken, getApplicantsDetails);
router.put('/withdraw-application', verifyToken, withdrawApplication);

router.get('/getAll-appliedJobs', verifyToken, getMyApplications);
router.put("/employerApproval", verifyToken, updateEmployerApprovalStatus);
router.get("/approved-applicants", verifyToken, getApprovedApplicants);


//get full details of job seeker by employer by passing job seeker id
router.get("/jobSeekerDetails/:jobSeekerId", verifyToken, getSeekerApplicantDetails);

module.exports = router;
