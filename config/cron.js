const cron = require("node-cron");
const JobPost = require("../models/JobPost");


cron.schedule("0 0 * * *", async () => {
  try {
    console.log("Running daily job expiry check...");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await JobPost.updateMany(
      {
        expiredDate: { $lte: today },
        status: "active"
      },
      { $set: { status: "expired" } }
    );

    console.log(`Expired jobs updated: ${result.modifiedCount}`);
  } catch (error) {
    console.error("Error running cron job for expiring jobs:", error);
  }
});
