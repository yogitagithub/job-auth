const CompanyProfile = require("../models/CompanyProfile");
const IndustryType = require("../models/AdminIndustry");
const StateCity = require("../models/StateCity");

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");


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

  
    if (req.body.industryType) {
      const industry = await IndustryType.findOne({ name: req.body.industryType });
      if (!industry) {
        return res.status(400).json({
          status: false,
          message: "Invalid industry type name."
        });
      }
      req.body.industryType = industry._id;
    }

   
    if (req.body.state && req.body.city) {
      const stateDoc = await StateCity.findOne({ state: req.body.state });
      if (!stateDoc) {
        return res.status(400).json({
          status: false,
          message: "Invalid state name."
        });
      }

    
      if (!stateDoc.cities.includes(req.body.city)) {
        return res.status(400).json({
          status: false,
          message: "Invalid city for the selected state."
        });
      }

    
      req.body.state = stateDoc._id;
    } else {
      return res.status(400).json({
        status: false,
        message: "State and city are required."
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
    } else {
      const restrictedFields = ["_id", "userId", "phoneNumber", "__v", "image"];
      Object.keys(req.body).forEach((field) => {
        if (!restrictedFields.includes(field)) {
          profile[field] = req.body[field];
        }
      });

      await profile.save();
    }

  
    const populatedProfile = await CompanyProfile.findById(profile._id)
      .populate("state", "state")         
      .populate("industryType", "name"); 

    return res.status(200).json({
      status: true,
      message: "Company profile saved successfully.",
      data: {
        ...populatedProfile.toObject(),
        state: populatedProfile.state?.state || null, 
        city: populatedProfile.city,                 
        industryType: populatedProfile.industryType?.name || null
      }
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

    const profile = await CompanyProfile.findOne({ userId })
      .populate("industryType", "name")
       .populate("state", "state");

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
      industryType: profileObj.industryType?.name || null,
      contactPersonName: profileObj.contactPersonName,
      panCardNumber: profileObj.panCardNumber,
      gstNumber: profileObj.gstNumber,
      alternatePhoneNumber: profileObj.alternatePhoneNumber,
      email: profileObj.email,
      companyAddress: profileObj.companyAddress,
      state: profileObj.state?.state || null,
      city: profileObj.city,
      pincode: profileObj.pincode,
      image: profileObj.image
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

exports.deleteCompanyProfile = async (req, res) => {
  try {
    const { role, userId } = req.user;
    const { id } = req.body;

   
    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can delete company profiles."
      });
    }

   
    if (!id) {
      return res.status(400).json({
        status: false,
        message: "Company profile ID is required."
      });
    }

   
    const profile = await CompanyProfile.findById(id);
    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found."
      });
    }

   
    if (profile.userId.toString() !== userId) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to delete this profile."
      });
    }

    
    profile.isDeleted = true;
    profile.deletedAt = new Date();
    await profile.save();

    return res.status(200).json({
      status: true,
      message: "Company profile soft deleted successfully."
    });

  } catch (error) {
    console.error("Error soft deleting company profile:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};

exports.updateProfileImage = async (req, res) => {
  try {
    const { userId, role } = req.user;

    console.log("Incoming Request User:", req.user);
    console.log("Uploaded File Details:", req.file);

    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can update the company image."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: false,
        message: "Image file is required."
      });
    }

    const profile = await CompanyProfile.findOne({ userId });
    console.log("Fetched Profile from DB:", profile);

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found."
      });
    }

  
if (profile.image) {
  console.log("Existing image URL in DB:", profile.image);

  const oldImageFile = path.basename(profile.image);
  console.log("Extracted old image filename:", oldImageFile);

  if (oldImageFile && oldImageFile !== req.file.filename) {
    const oldImagePath = path.join(__dirname, "..", "uploads", "images", oldImageFile);
    console.log("Full old image path to delete:", oldImagePath);

    try {
      await fsp.unlink(oldImagePath); 
      console.log("Old image deleted successfully:", oldImageFile);
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error("⚠ Error deleting old image:", err);
      }
    }
  } else {
    console.log("No old image to delete or same filename uploaded");
  }
}

   
   
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const newImagePath = `${baseUrl}/uploads/images/${req.file.filename}`;
    console.log("New image URL to save in DB:", newImagePath);

    profile.image = newImagePath;
    await profile.save();

    console.log("Profile updated successfully with new image");

    return res.status(200).json({
      status: true,
      message: "Company profile image updated successfully. Old image deleted if it existed.",
      data: {
        image: newImagePath,
      },
    });

  } catch (error) {
    console.error("Error updating company profile image:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message,
    });
  }
};
exports.getProfileImage = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can fetch the profile image."
      });
    }

    const profile = await CompanyProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found."
      });
    }

    return res.status(200).json({
      status: true,
      message: "Company profile image fetched successfully.",
      data: {
        image: profile.image || null
      }
    });
  } catch (error) {
    console.error("Error fetching company profile image:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};

exports.getAllCompanies = async (req, res) => {
  try {
  
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

  
    const totalCompanies = await CompanyProfile.countDocuments();

   
    const companies = await CompanyProfile.find()
      .populate("industryType", "name")
       .populate("state", "state")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }); 

    if (!companies || companies.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No company profiles found."
      });
    }

   
    const responseData = companies.map(company => ({
      id: company._id,
      userId: company.userId,
      phoneNumber: company.phoneNumber,
      companyName: company.companyName,
      industryType: company.industryType?.name || null,
      contactPersonName: company.contactPersonName,
      panCardNumber: company.panCardNumber,
      gstNumber: company.gstNumber,
      alternatePhoneNumber: company.alternatePhoneNumber,
      email: company.email,
      companyAddress: company.companyAddress,
      state: company.state?.state || null,
      city: company.city,
      pincode: company.pincode,
      image: company.image
    }));

    return res.json({
      status: true,
      message: "Company profiles fetched successfully.",
      totalCompanies,
      currentPage: page,
      totalPages: Math.ceil(totalCompanies / limit),
      data: responseData
    });
  } catch (error) {
    console.error("Error fetching companies:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};





