const express = require('express');
const router = express.Router();

const { createOrUpdateSplashScreen, getAllSplashScreens, getSplashScreenById, deleteSplashScreen } = require('../controllers/splashScreenController');

const uploadImage = require('../middleware/uploadImage');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

// Create or Update
router.post('/create-screen', 
    verifyToken, verifyAdmin,
    uploadImage.single('image'), 
    createOrUpdateSplashScreen);

// Get All
router.get('/getAll-screen', verifyToken, verifyAdmin, getAllSplashScreens);

// Get by ID
router.get('/getById/:id', verifyToken, verifyAdmin, getSplashScreenById);

// Delete
router.delete('/deleteById/:id', verifyToken, verifyAdmin, deleteSplashScreen);

module.exports = router;
