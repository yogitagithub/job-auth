const express = require("express");
const router = express.Router();
const { getAllStates, getCitiesByState } = require("../controllers/stateCityController");
const { verifyToken } = require('../middleware/authMiddleware');

router.get("/states", getAllStates);
router.get("/cities", getCitiesByState);

module.exports = router;
