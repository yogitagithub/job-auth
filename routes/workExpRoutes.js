const express = require("express");
const router = express.Router();
const { createWorkExp, getMyWorkExp, updateWorkExp, deleteWorkExp } = require('../controllers/workExpController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-workExp', verifyToken, createWorkExp);
 router.get('/get-workExp', verifyToken, getMyWorkExp);
 router.put('/update-workExp', verifyToken, updateWorkExp);
 router.delete('/delete-workExp', verifyToken, deleteWorkExp);


module.exports = router;
