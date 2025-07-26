const express = require("express");
const router = express.Router();
const { sendAdminOtp, verifyAdminOtp, createCategory,
  getAdminCategory,
  updateCategory,
  deleteCategory,
  createIndustry, getAdminIndustry,
  updateIndustry,
  deleteIndustry, getCategories, getIndustry } = require('../controllers/adminController');
const { verifyToken, verifyAdmin, verifyEmployerOnly, verifyJobSeekerOnly } = require('../middleware/authMiddleware');


router.post('/send-otp', sendAdminOtp);
router.post('/verify-otp', verifyAdminOtp);

//category crud
router.post("/create-categories", verifyToken, verifyAdmin, createCategory);
router.get("/getAll-categories", verifyToken, verifyAdmin, getAdminCategory);
router.put("/update-categories/:id", verifyToken, verifyAdmin, updateCategory);
router.delete("/delete-categories/:id", verifyToken, verifyAdmin, deleteCategory);


//industry crud
router.post("/create-industry", verifyToken, verifyAdmin, createIndustry);
router.get("/getAll-industry", verifyToken, verifyAdmin, getAdminIndustry);
router.put("/update-industry/:id", verifyToken, verifyAdmin, updateIndustry);
router.delete("/delete-industry/:id", verifyToken, verifyAdmin, deleteIndustry);

//get all employees
router.get("/get-categories-employers", verifyToken, verifyEmployerOnly, getCategories);
router.get("/get-industry-employers", verifyToken, verifyEmployerOnly, getIndustry);

//get all job_seekers
router.get("/get-industry-jobSeekers", verifyToken, verifyJobSeekerOnly, getIndustry);

module.exports = router;
