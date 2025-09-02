const express = require("express");
const router = express.Router();
const { addMySkills, getMySkills, updateSkill, deleteSkill } = require('../controllers/skillsController');
const { listAdminSkills } = require('../controllers/adminController');

const { verifyToken } = require('../middleware/authMiddleware');


router.post('/add-skills', verifyToken, addMySkills);
 router.get('/get-skills', verifyToken, getMySkills);
  router.put('/update-skills', verifyToken, updateSkill);
router.delete('/delete-skills', verifyToken, deleteSkill);


//get list of admin skill list on the basis of search, populara and active
router.get('/get-adminSkills', verifyToken, listAdminSkills);



module.exports = router;
