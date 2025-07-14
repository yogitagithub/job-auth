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

   
    const profileObj = profile.toObject();

    
    const responseData = {
      id: profileObj._id,
      userId: profileObj.userId,
      phoneNumber: profileObj.phoneNumber,
      companyName: profileObj.companyName,
      industryType: profileObj.industryType,
      contactPersonName: profileObj.contactPersonName,
      panCardNumber: profileObj.panCardNumber,
      gstNumber: profileObj.gstNumber,
      alternatePhoneNumber: profileObj.alternatePhoneNumber,
      email: profileObj.email,
      companyAddress: profileObj.companyAddress,
      state: profileObj.state,
      city: profileObj.city,
      pincode: profileObj.pincode
    };

    return res.json({
      status: true,
      message: "Company profile fetched successfully.",
      data: responseData
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











