const express = require("express");
const router = express.Router();
const { adminLogin, createCategory,
  getAdminCategory,
  updateCategory,
  deleteCategory,
  createIndustry, getAdminIndustry,
  updateIndustry,
  deleteIndustry, getCategories, getIndustry } = require('../controllers/adminController');
const { 
    // verifyAdmin
     verifyToken
 } = require('../middleware/authMiddleware');


router.post('/login', adminLogin);

//category crud
router.post("/create-categories", verifyToken, createCategory);
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
