const CompanyProfile = require("../models/CompanyProfile");
const JobPost = require("../models/JobPost");

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

   
    let profile = await CompanyProfile.findOne({ phoneNumber });

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
      message: "Company profile updated successfully",
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

exports.getProfile = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can view company profiles."
      });
    }

    const profile = await CompanyProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found."
      });
    }

    return res.json({
      status: true,
      message: "Company profile fetched successfully.",
      data: profile
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};







