const express = require("express");
const router = express.Router();
const { saveProfile } = require('../controllers/jobSeekerController');

// POST or PUT profile
router.post('/jobSeeker-profile', saveProfile);

module.exports = router;