const express = require("express");
const router = express.Router();
const { sendAdminOtp, verifyAdminOtp, createCategory,
  getAdminCategory,
  updateCategory,
  deleteCategory,
  createIndustry, getAdminIndustry,
  updateIndustry,
  deleteIndustry, getCategories, getIndustry } = require('../controllers/adminController');
const { verifyToken, verifyAdmin, verifyEmployerOrAdmin } = require('../middleware/authMiddleware');


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
router.get("/get-categories", verifyToken, verifyEmployerOrAdmin, getCategories);
router.get("/get-industry", verifyToken, verifyEmployerOrAdmin, getIndustry);


module.exports = router;
