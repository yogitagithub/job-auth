const express = require("express");
const router = express.Router();
const { createSkills, getMySkills, updateSkillById, deleteSkillById } = require('../controllers/skillsController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-skills', verifyToken, createSkills);
 router.get('/get-skills', verifyToken, getMySkills);
  router.put('/update-skills', verifyToken, updateSkillById );
router.delete('/delete-skills', verifyToken, deleteSkillById);



module.exports = router;
