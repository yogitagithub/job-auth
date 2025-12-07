const express = require("express");
const router = express.Router();

const { getNotifications, markAsRead, markAllRead } = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/authMiddleware');

//employer can get his notification
router.get("/notifications", verifyToken, getNotifications);

//employer can update is as mark as read
router.put("/markRead/:notificationId", verifyToken, markAsRead);

//employer can mark as all read
router.put("/markAllRead", verifyToken, markAllRead);


module.exports = router;
