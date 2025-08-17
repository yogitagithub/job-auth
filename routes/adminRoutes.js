const express = require("express");
const router = express.Router();

const { sendAdminOtp, verifyAdminOtp, createCategory, getIndustry, getCategory,
  updateCategory,
  deleteCategory,
  createIndustry,
  updateIndustry,
  deleteIndustry, createProfile, getProfile, updateProfile, deleteProfile, 
  createExperience, getExperience, updateExperience, deleteExperience, 
getJobTypes, deleteJobType, updateJobType, createJobType, deleteSalaryType, createSalaryType, getSalaryTypes, updateSalaryType } = require('../controllers/adminController');

  const { verifyToken, verifyAdmin, verifyEmployerOnly, verifyJobSeekerOnly } = require('../middleware/authMiddleware');


router.post('/send-otp', sendAdminOtp);
router.post('/verify-otp', verifyAdminOtp);

//category crud
router.post("/create-categories", verifyToken, verifyAdmin, createCategory);
router.get('/categories', verifyToken, verifyAdmin, getCategory);
router.put("/update-categories/:id", verifyToken, verifyAdmin, updateCategory);
router.delete("/delete-categories/:id", verifyToken, verifyAdmin, deleteCategory);


//industry crud
router.post("/create-industry", verifyToken, verifyAdmin, createIndustry);
router.get('/industries', verifyToken, verifyAdmin, getIndustry);
router.put("/update-industry/:id", verifyToken, verifyAdmin, updateIndustry);
router.delete("/delete-industry/:id", verifyToken, verifyAdmin, deleteIndustry);

//job profile crud
router.post("/createJobProfile", verifyToken, verifyAdmin, createProfile);
router.get("/getJobProfile", verifyToken, verifyAdmin, getProfile);
router.put("/updateJobProfile/:id", verifyToken, verifyAdmin, updateProfile);
router.delete("/deleteJobProfile/:id", verifyToken, verifyAdmin, deleteProfile);

router.get("/getJobProfile-jobSeekers", verifyToken, verifyJobSeekerOnly, getProfile);

//experience range crud
router.post("/create-experience", verifyToken, verifyAdmin, createExperience);
router.get("/get-experience", verifyToken, verifyAdmin, getExperience);
router.put("/update-experience", verifyToken, verifyAdmin, updateExperience);
router.delete("/delete-experience", verifyToken, verifyAdmin, deleteExperience);

//job type crud
router.post("/create-job-types",  verifyToken, verifyAdmin, createJobType);
 router.put("/update-job-types",   verifyToken, verifyAdmin, updateJobType);   
 router.delete("/delete-job-types",verifyToken, verifyAdmin, deleteJobType);  
 router.get("/get-job-types",   verifyToken, verifyAdmin, getJobTypes);

 //salary type crud
router.post("/create-salary-types",  verifyToken, verifyAdmin, createSalaryType);
  router.put("/update-salary-types",   verifyToken, verifyAdmin, updateSalaryType);   
  router.delete("/delete-salary-types",verifyToken, verifyAdmin, deleteSalaryType);  
  router.get("/get-salary-types",   verifyToken, verifyAdmin, getSalaryTypes);





module.exports = router;
