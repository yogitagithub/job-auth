const express = require("express");
const router = express.Router();
const { getAllStates, getCitiesByState } = require("../controllers/stateCityController");
const { verifyToken } = require('../middleware/authMiddleware');

router.get("/states", verifyToken, getAllStates);
router.get("/cities", verifyToken, getCitiesByState);

module.exports = router;
