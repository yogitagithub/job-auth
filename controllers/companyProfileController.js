const CompanyProfile = require("../models/CompanyProfile");


exports.saveProfile = async (req, res) => {
  try {
    const { userId, role, phoneNumber } = req.user;

    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can create or update company profiles."
      });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        status: false,
        message: "No fields provided to create or update."
      });
    }

    let profile = await CompanyProfile.findOne({ userId });

    if (!profile) {
      profile = new CompanyProfile({
        userId,
        phoneNumber,
        ...req.body
      });

      await profile.save();

      return res.status(201).json({
        status: true,
        message: "Company profile created successfully.",
        data: profile
      });
    }

    const restrictedFields = ["_id", "userId", "phoneNumber", "__v"];
    Object.keys(req.body).forEach((field) => {
      if (restrictedFields.includes(field)) return;
      profile[field] = req.body[field];
    });

    await profile.save();

    return res.status(200).json({
      status: true,
      message: "Company profile updated successfully.",
      data: profile
    });
  } catch (error) {
    console.error("Error creating/updating company profile:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
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







