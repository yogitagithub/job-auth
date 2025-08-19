const express = require("express");
const router = express.Router();

const { getAllStates, getCitiesByState,
    getAllStatesPublic, getCitiesByStatePublic
 } = require("../controllers/stateCityController");
 
const { verifyToken } = require('../middleware/authMiddleware');


//with token
router.get("/states", verifyToken, getAllStates);
router.get("/cities", verifyToken, getCitiesByState);

//without token
router.get("/public-states", getAllStatesPublic);
router.get("/public-cities", getCitiesByStatePublic);

module.exports = router;
