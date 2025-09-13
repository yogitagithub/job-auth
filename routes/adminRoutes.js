const express = require("express");
const router = express.Router();
const uploadImage = require('../middleware/uploadImage');

const { sendAdminOtp, verifyAdminOtp, createCategory, getIndustry, getCategory,
  updateCategory,
  deleteCategory,
  createIndustry,
  updateIndustry,
  deleteIndustry, createProfile, getProfile, updateProfile, deleteProfile,
  createExperience, getExperience, updateExperience, deleteExperience,
  getJobTypes, deleteJobType, updateJobType, createJobType, deleteSalaryType, createSalaryType, getSalaryTypes, updateSalaryType,
getOtherField, deleteOtherField, updateOtherField, createOtherField,
getCompanyProfiles, getCompanyProfilesById, getJobSeekerProfiles, addFeaturedCompanies, getFeaturedCompanies,
updateFeaturedCompanies, deleteFeaturedCompanies, createCurrentSalary,
getCurrentSalary, deleteCurrentSalary, updateCurrentSalary, createWorkingShift,
updateWorkingShift, deleteWorkingShift, getWorkingShift, getJobSeekerProfilesbyId, 
createSkill, getSkill, updateSkill, deleteSkill, getJobPostsByCategoryPublic,
createAccountType, updateAccountType, deleteAccountType, getAccountTypes } = require('../controllers/adminController');

const { verifyToken, verifyAdmin, verifyEmployerOnly, verifyJobSeekerOnly } = require('../middleware/authMiddleware');
const { adminApproveJobPost, getJobList, updateJobListById, adminRecommendJobPost } = require('../controllers/jobPostController');
const { adminRecommendJobSeeker } = require('../controllers/jobSeekerController');


router.post('/send-otp', sendAdminOtp);
router.post('/verify-otp', verifyAdminOtp);

//category crud

router.post("/create-categories", verifyToken, verifyAdmin, uploadImage.single("image"), createCategory);
router.get('/categories', verifyToken, verifyAdmin, getCategory);
router.put("/update-categories/:id", uploadImage.single("image"), verifyToken, verifyAdmin, updateCategory);
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



//experience range crud
router.post("/create-experience", verifyToken, verifyAdmin, createExperience);
router.get("/get-experience", verifyToken, verifyAdmin, getExperience);
router.put("/update-experience", verifyToken, verifyAdmin, updateExperience);
router.delete("/delete-experience", verifyToken, verifyAdmin, deleteExperience);

//job type crud
router.post("/create-job-types", verifyToken, verifyAdmin, createJobType);
router.put("/update-job-types", verifyToken, verifyAdmin, updateJobType);
router.delete("/delete-job-types", verifyToken, verifyAdmin, deleteJobType);
router.get("/get-job-types", verifyToken, verifyAdmin, getJobTypes);

//salary type crud
router.post("/create-salary-types", verifyToken, verifyAdmin, createSalaryType);
router.put("/update-salary-types", verifyToken, verifyAdmin, updateSalaryType);
router.delete("/delete-salary-types", verifyToken, verifyAdmin, deleteSalaryType);
router.get("/get-salary-types", verifyToken, verifyAdmin, getSalaryTypes);

// other field
router.post("/create-other-field", verifyToken, verifyAdmin, createOtherField);
router.put("/update-other-field", verifyToken, verifyAdmin, updateOtherField);
router.delete("/delete-other-field", verifyToken, verifyAdmin, deleteOtherField);
router.get("/get-other-field", verifyToken, verifyAdmin, getOtherField);

//company profiles list
router.get("/company-profiles", verifyToken, verifyAdmin, getCompanyProfiles);
router.get("/company-profiles/:id", verifyToken, verifyAdmin, getCompanyProfilesById);

//job seeker profile list
router.get("/job-seeker", verifyToken, verifyAdmin, getJobSeekerProfiles);
router.get("/job-seeker/:id", verifyToken, verifyAdmin, getJobSeekerProfilesbyId);

//featured companies
router.post("/add-featured-companies", verifyToken, verifyAdmin, addFeaturedCompanies);
 router.put("/update-featured-companies", verifyToken, verifyAdmin, updateFeaturedCompanies);
 router.delete("/delete-featured-companies", verifyToken, verifyAdmin, deleteFeaturedCompanies);
 router.get("/get-featured-companies", verifyToken, verifyAdmin, getFeaturedCompanies);

 // current salary
router.post("/create-current-salary", verifyToken, verifyAdmin, createCurrentSalary);
router.put("/update-current-salary", verifyToken, verifyAdmin, updateCurrentSalary);
 router.delete("/delete-current-salary", verifyToken, verifyAdmin, deleteCurrentSalary);
router.get("/get-current-salary", verifyToken, verifyAdmin, getCurrentSalary);


 // working shift
router.post("/create-working-shift", verifyToken, verifyAdmin, createWorkingShift);
router.put("/update-working-shift", verifyToken, verifyAdmin, updateWorkingShift);
 router.delete("/delete-working-shift", verifyToken, verifyAdmin, deleteWorkingShift);
router.get("/get-working-shift", verifyToken, verifyAdmin, getWorkingShift);


//admin job post 
router.put('/job-post-approve', verifyToken, verifyAdmin, adminApproveJobPost);
router.get('/job-list', verifyToken, verifyAdmin, getJobList);
router.put('/update-job-post', verifyToken, verifyAdmin, updateJobListById);
router.put('/job-post-recommended', verifyToken, verifyAdmin, adminRecommendJobPost);


//skill set
router.post("/create-skill", verifyToken, verifyAdmin, createSkill);
router.get("/get-skill", verifyToken, verifyAdmin, getSkill);
router.put("/update-skill/:id", verifyToken, verifyAdmin, updateSkill);
router.delete("/delete-skill/:id", verifyToken, verifyAdmin, deleteSkill);



//account type crud
router.post("/create-account-types", verifyToken, verifyAdmin, createAccountType);
 router.put("/update-account-types", verifyToken, verifyAdmin, updateAccountType);
 router.delete("/delete-account-types", verifyToken, verifyAdmin, deleteAccountType);
router.get("/get-account-types", verifyToken, verifyAdmin, getAccountTypes);



//get job list based on category id for admin only
router.get("/public-categories/:categoryId",verifyToken, verifyAdmin, getJobPostsByCategoryPublic);


//admin recommended job seeker profiles
router.put('/job-seeker-recommended', verifyToken, verifyAdmin, adminRecommendJobSeeker);







module.exports = router;
