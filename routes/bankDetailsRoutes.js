const express = require("express");
const router = express.Router();
const { createBank, getMyBank, updateBankById, deleteBankById } = require('../controllers/bankDetailsController');
const { verifyToken } = require('../middleware/authMiddleware');


router.post('/create-bankDetails', verifyToken, createBank);
  
  router.get('/get-bankDetails', verifyToken, getMyBank);
  router.put('/update-bankDetails', verifyToken, updateBankById);
  router.delete('/delete-bankDetails', verifyToken, deleteBankById);


module.exports = router;
