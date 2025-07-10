const JobSeekerProfile = require("../models/JobSeekerProfile");

exports.saveProfile = async (req, res) => {
  try {
    const { phoneNumber, ...updateFields } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        status: false,
        message: "phoneNumber is required to find the profile"
      });
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({
        status: false,
        message: "No fields to update"
      });
    }

   
    let profile = await JobSeekerProfile.findOne({ phoneNumber });

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "From this phoneNumber number, role has not been selected."
      });
    }

    
    Object.keys(updateFields).forEach(field => {
      profile[field] = updateFields[field];
    });

    await profile.save();

    return res.json({
      status: true,
      message: "Job Seeker profile updated successfully",
      data: profile
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: false,
      message: "Server error",
      error: error.message
    });
  }
};