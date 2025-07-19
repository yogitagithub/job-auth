const express = require("express");
const router = express.Router();
const { sendAdminOtp, verifyAdminOtp, createCategory,
  getAdminCategory,
  updateCategory,
  deleteCategory,
  createIndustry, getAdminIndustry,
  updateIndustry,
  deleteIndustry, getCategories, getIndustry } = require('../controllers/adminController');
const { 
     verifyToken, verifyAdmin 
 } = require('../middleware/authMiddleware');


router.post('/send-otp', sendAdminOtp);
router.post('/verify-otp', verifyAdminOtp);

//category crud
router.post("/create-categories", verifyToken, verifyAdmin, createCategory);
router.get("/getAll-categories", verifyToken, getAdminCategory);
router.put("/update-categories/:id", verifyToken, updateCategory);
router.delete("/delete-categories/:id", verifyToken, deleteCategory);


//industry crud
// router.post("/create-industry", verifyAdmin, createIndustry);
// router.get("/getAll-industry", verifyAdmin, getAdminIndustry);
// router.put("/update-industry/:id", verifyAdmin, updateIndustry);
// router.delete("/delete-industry/:id", verifyAdmin, deleteIndustry);

//get all employees
router.get("/get-categories", verifyToken, getCategories);
router.get("/get-industry", verifyToken, getIndustry);


module.exports = router;
