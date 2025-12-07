const Notification = require("../models/Notification");

module.exports = async function createNotification(
  userId,
  title,
  message,
  type
) {
  try {
    await Notification.create({
      userId,
      title,
      message,
      type,
    });
  } catch (error) {
    console.log("Error creating notification:", error);
  }
};
