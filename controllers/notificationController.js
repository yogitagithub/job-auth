const mongoose = require("mongoose");
const Notification = require("../models/Notification");


//employer can get his notification
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Pagination params
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;
    let skip = (page - 1) * limit;

    console.log("USER ID FROM TOKEN:", userId);

    // Count total docs for this employer
    const totalRecord = await Notification.countDocuments({ userId });

    // Fetch paginated notifications
    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPage = Math.ceil(totalRecord / limit);

    return res.status(200).json({
      status: true,
      message: "Notifications fetched successfully",
      totalRecord,
      totalPage,
      currentPage: page,
      data: notifications,
    });

  } catch (error) {
    console.log("GET notifications error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId; // <-- FIXED

    const { notificationId } = req.params;

    const updated = await Notification.findOneAndUpdate(
      { _id: notificationId, userId }, // ensure employer owns it
      { isRead: true },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        status: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Notification marked as read",
      data: updated,
    });
  } catch (error) {
    console.log("Mark as read error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};



//employer can mark as all read
exports.markAllRead = async (req, res) => {
  try {
 const userId = req.user.userId; // <-- FIXED


    await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true }
    );

    return res.status(200).json({
      status: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.log("Mark all read error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};



