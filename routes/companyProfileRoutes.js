const express = require("express");
const router = express.Router();
const { saveProfile } = require('../controllers/companyProfileController');

// POST or PUT profile
router.post('/company-profile', saveProfile);

module.exports = router;
