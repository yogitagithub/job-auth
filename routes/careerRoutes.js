const express = require("express");
const router = express.Router();
const { createCareer, getMyCareer, deleteCareer } = require('../controllers/careerPreferenceController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-career', verifyToken, createCareer);
 router.get('/get-career', verifyToken, getMyCareer);

 router.delete("/delete-career", verifyToken, deleteCareer);


module.exports = router;
