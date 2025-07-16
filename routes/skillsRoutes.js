const express = require("express");
const router = express.Router();
const { createSkills, getMySkills, deleteSelectedSkills } = require('../controllers/skillsController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-skills', verifyToken, createSkills);
 router.get('/get-skills', verifyToken, getMySkills);
router.delete('/delete-skills', verifyToken, deleteSelectedSkills);



module.exports = router;
