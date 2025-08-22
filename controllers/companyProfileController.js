const CompanyProfile = require("../models/CompanyProfile");
const IndustryType = require("../models/AdminIndustry");
const StateCity = require("../models/StateCity");

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const mongoose = require("mongoose");



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

    // Get current profile early (helps city-only/state-only logic)
    let profile = await CompanyProfile.findOne({ userId });

    // ⛔ Block updates if profile exists but is soft-deleted
    if (profile && profile.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This company profile has been soft deleted and cannot be updated."
      });
    }

    // aboutCompany: normalize only if key is present
    if (Object.prototype.hasOwnProperty.call(req.body, "aboutCompany")) {
      const v = req.body.aboutCompany;
      req.body.aboutCompany = v && String(v).trim() ? String(v).trim() : null;
    }

    // --------- industryType (optional) ----------
    if (Object.prototype.hasOwnProperty.call(req.body, "industryType")) {
      const val = req.body.industryType;
      let industryDoc = null;

      if (mongoose.Types.ObjectId.isValid(val)) {
        industryDoc = await IndustryType.findById(val);
      }
      if (!industryDoc && typeof val === "string") {
        industryDoc = await IndustryType.findOne({ name: val.trim() });
      }
      if (!industryDoc) {
        return res.status(400).json({
          status: false,
          message: "Invalid industry type (use valid name or id)."
        });
      }
      req.body.industryType = industryDoc._id;
    }

    // --------- state & city (optional, flexible) ----------
    const hasState = Object.prototype.hasOwnProperty.call(req.body, "state");
    const hasCity  = Object.prototype.hasOwnProperty.call(req.body, "city");

    // Helper: resolve a state by name or id
    const resolveState = async (input) => {
      if (mongoose.Types.ObjectId.isValid(input)) {
        return StateCity.findById(input);
      }
      return StateCity.findOne({ state: input });
    };

    // Case A: state provided (with or without city)
    if (hasState) {
      const stateDoc = await resolveState(req.body.state);
      if (!stateDoc) {
        return res.status(400).json({ status: false, message: "Invalid state." });
      }

      // If city is also provided, validate against this state
      if (hasCity) {
        if (!req.body.city || !stateDoc.cities.includes(req.body.city)) {
          return res.status(400).json({
            status: false,
            message: "Invalid city for the selected state."
          });
        }
      } else {
        // state-only update: if existing city is now invalid for new state, clear it
        const existingCity = profile?.city;
        if (existingCity && !stateDoc.cities.includes(existingCity)) {
          req.body.city = null; // keep data consistent
        }
      }

      req.body.state = stateDoc._id; // store as ObjectId
    }

    // Case B: only city provided (no state key in body)
    if (!hasState && hasCity) {
      if (!profile) {
        // On create, cannot validate city without knowing state
        return res.status(400).json({
          status: false,
          message: "Cannot update only city on create. Provide state as well."
        });
      }
      if (!profile.state) {
        return res.status(400).json({
          status: false,
          message: "Cannot update city because state is missing in profile."
        });
      }

      const stateDoc = await StateCity.findById(profile.state);
      if (!stateDoc) {
        return res.status(400).json({
          status: false,
          message: "Stored state not found."
        });
      }
      if (!req.body.city || !stateDoc.cities.includes(req.body.city)) {
        return res.status(400).json({
          status: false,
          message: "Invalid city for the stored state."
        });
      }
      // nothing else to change; city will be set below
    }

    // --------- Create or Update (partial allowed) ----------
    const restrictedFields = ["_id", "userId", "phoneNumber", "__v", "image", "isDeleted", "deletedAt"];
    const isCreate = !profile;

    if (isCreate) {
      profile = new CompanyProfile({
        userId,
        phoneNumber,
        ...Object.keys(req.body).reduce((acc, k) => {
          if (!restrictedFields.includes(k)) acc[k] = req.body[k];
          return acc;
        }, {})
      });
      await profile.save();
    } else {
      Object.keys(req.body).forEach((field) => {
        if (!restrictedFields.includes(field)) {
          profile[field] = req.body[field];
        }
      });
      await profile.save();
    }

    // --------- Populate & respond ----------
    const populated = await CompanyProfile.findById(profile._id)
      .populate("state", "state")
      .populate("industryType", "name");

    return res.status(200).json({
      status: true,
      message: `Company profile ${isCreate ? "created" : "updated"} successfully.`,
      data: {
        ...populated.toObject(),
        state: populated.state?.state || null,
        city: populated.city ?? null,
        industryType: populated.industryType?.name || null,
        aboutCompany: populated.aboutCompany ?? null
      }
    });
  } catch (error) {
    console.error("Error creating/updating company profile:", error);
    return res.status(500).json({
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

    // Fetch without filtering isDeleted so we can detect soft-deleted state
    const profile = await CompanyProfile.findOne({ userId })
      .populate("industryType", "name")
      .populate("state", "state");

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found."
      });
    }

    // If soft-deleted, send 400 with explicit message
    if (profile.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This company profile has been already soft deleted."
      });
    }

    const p = profile.toObject();
    const responseData = {
      id: p._id,
      userId: p.userId,
      phoneNumber: p.phoneNumber,
      companyName: p.companyName,
      industryType: p.industryType?.name || null,
      contactPersonName: p.contactPersonName,
      panCardNumber: p.panCardNumber,
      gstNumber: p.gstNumber,
      alternatePhoneNumber: p.alternatePhoneNumber,
      email: p.email,
      companyAddress: p.companyAddress,
      state: p.state?.state || null,
      city: p.city,
      pincode: p.pincode,
      image: p.image
    };

    return res.status(200).json({
      status: true,
      message: "Company profile fetched successfully.",
      data: responseData
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
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

    // AuthZ: only employers
    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can delete company profiles."
      });
    }

    // Validate ID
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: false,
        message: "Valid company profile ID is required."
      });
    }

    // Load the profile
    const profile = await CompanyProfile.findById(id);
    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Company profile not found."
      });
    }

    // Ownership check
    if (profile.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to delete this profile."
      });
    }

    // Already soft-deleted?
    if (profile.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This company profile is already soft deleted."
      });
    }

    // Soft delete
    profile.isDeleted = true;
    profile.deletedAt = new Date(); // will be saved only if 'deletedAt' exists in schema
    await profile.save();

    return res.status(200).json({
      status: true,
      message: "Company profile soft deleted successfully."
    });
  } catch (error) {
    console.error("Error soft deleting company profile:", error);
    return res.status(500).json({
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

//without token
exports.getAllCompanies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Count only non-deleted companies
    const totalCompanies = await CompanyProfile.countDocuments({ isDeleted: false });

    const companies = await CompanyProfile.find({ isDeleted: false }) // ✅ filter here
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
