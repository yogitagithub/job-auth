const JobSeekerProfile = require("../models/JobSeekerProfile");
const IndustryType = require("../models/AdminIndustry");
const JobProfile = require("../models/AdminJobProfile");
const StateCity = require("../models/StateCity");

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const mongoose = require("mongoose");



exports.saveProfile = async (req, res) => {
  try {
    const { userId, role, phoneNumber } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can create or update their profiles."
      });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        status: false,
        message: "No fields provided to create or update."
      });
    }

    // Fetch existing profile early (needed for soft-delete check & city-only updates)
    let profile = await JobSeekerProfile.findOne({ userId });

    // ⛔ Block updates if profile exists but is soft-deleted
    if (profile && profile.isDeleted === true) {
      return res.status(400).json({
        status: false,
        message: "This job seeker profile is already soft deleted and cannot be updated."
      });
    }

    // ---------- industryType (optional; accept name or ObjectId) ----------
    if (Object.prototype.hasOwnProperty.call(req.body, "industryType")) {
      const val = req.body.industryType;
      let doc = null;

      if (mongoose.Types.ObjectId.isValid(val)) doc = await IndustryType.findById(val);
      if (!doc && typeof val === "string") doc = await IndustryType.findOne({ name: val.trim() });

      if (!doc) {
        return res.status(400).json({
          status: false,
          message: "Invalid industry type (use valid name or id)."
        });
      }
      req.body.industryType = doc._id;
    }

    // ---------- jobProfile (optional; accept name or ObjectId) ----------
    if (Object.prototype.hasOwnProperty.call(req.body, "jobProfile")) {
      const val = req.body.jobProfile;
      let doc = null;

      if (mongoose.Types.ObjectId.isValid(val)) doc = await JobProfile.findById(val);
      if (!doc && typeof val === "string") doc = await JobProfile.findOne({ name: val.trim() });

      if (!doc) {
        return res.status(400).json({
          status: false,
          message: "Invalid job profile (use valid name or id)."
        });
      }
      req.body.jobProfile = doc._id;
    }

    // ---------- dateOfBirth (optional; accept DD-MM-YYYY, YYYY-MM-DD, ISO) ----------
    if (Object.prototype.hasOwnProperty.call(req.body, "dateOfBirth")) {
      const raw = String(req.body.dateOfBirth).trim();

      let parsed = null;
      if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
        const [dd, mm, yyyy] = raw.split("-");
        parsed = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        parsed = new Date(`${raw}T00:00:00.000Z`);
      } else if (!Number.isNaN(Date.parse(raw))) {
        parsed = new Date(raw);
      }

      if (!parsed || Number.isNaN(parsed.getTime())) {
        return res.status(400).json({
          status: false,
          message: "Invalid dateOfBirth. Use DD-MM-YYYY or YYYY-MM-DD."
        });
      }
      req.body.dateOfBirth = parsed;
    }

    // ---------- state & city (optional, flexible) ----------
    const hasState = Object.prototype.hasOwnProperty.call(req.body, "state");
    const hasCity  = Object.prototype.hasOwnProperty.call(req.body, "city");

    const resolveState = async (input) => {
      if (mongoose.Types.ObjectId.isValid(input)) return StateCity.findById(input);
      return StateCity.findOne({ state: input });
    };

    // Case A: state provided (with or without city)
    if (hasState) {
      const stateDoc = await resolveState(req.body.state);
      if (!stateDoc) {
        return res.status(400).json({ status: false, message: "Invalid state." });
      }

      if (hasCity) {
        if (!req.body.city || !stateDoc.cities.includes(req.body.city)) {
          return res.status(400).json({
            status: false,
            message: "Invalid city for the selected state."
          });
        }
      } else {
        // state-only update: clear existing city if no longer valid
        const existingCity = profile?.city;
        if (existingCity && !stateDoc.cities.includes(existingCity)) {
          req.body.city = null;
        }
      }

      req.body.state = stateDoc._id; // store ObjectId
    }

    // Case B: only city provided (no state in body)
    if (!hasState && hasCity) {
      if (!profile) {
        return res.status(400).json({
          status: false,
          message: "Cannot set only city on create. Provide state as well."
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
    }

    // ---------- Create or Update (partial allowed) ----------
    const restrictedFields = ["_id", "userId", "phoneNumber", "__v", "image", "isDeleted", "deletedAt"];
    const isCreate = !profile;

    if (isCreate) {
      profile = new JobSeekerProfile({
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

    // ---------- Populate & respond ----------
    const populated = await JobSeekerProfile.findById(profile._id)
      .populate("industryType", "name")
      .populate("state", "state")
      .populate("jobProfile", "name");

    return res.status(200).json({
      status: true,
      message: `Job seeker profile ${isCreate ? "created" : "updated"} successfully.`,
      data: {
        ...populated.toObject(),
        industryType: populated.industryType?.name || null,
        state: populated.state?.state || null,
        jobProfile: populated.jobProfile?.name || null,
        city: populated.city ?? null,
        dateOfBirth: populated.dateOfBirth
          ? populated.dateOfBirth.toISOString().split("T")[0]
          : null
      }
    });
  } catch (error) {
    console.error("Error creating/updating job seeker profile:", error);
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

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view their profiles."
      });
    }

    // Fetch the profile (don't filter isDeleted so we can detect it explicitly)
    const profile = await JobSeekerProfile.findOne({ userId })
      .populate("industryType", "name")
      .populate("jobProfile", "name")
      .populate("state", "state");

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Job seeker profile not found."
      });
    }

    // If soft-deleted, block access with a clear status code
    if (profile.isDeleted === true) {
      return res.status(410).json({
        status: false,
        message: "This profile has been soft deleted and cannot be viewed."
      });
      // If you prefer 404/400/409, change the status above accordingly.
    }

    function formatDate(date) {
      if (!date) return null;
      const d = new Date(date);
      const day = String(d.getUTCDate()).padStart(2, "0");
      const month = String(d.getUTCMonth() + 1).padStart(2, "0");
      const year = d.getUTCFullYear();
      return `${year}-${month}-${day}`; // YYYY-MM-DD
    }

    const profileObj = profile.toObject();

    const responseData = {
      id: profileObj._id,
      userId: profileObj.userId,
      phoneNumber: profileObj.phoneNumber,
      name: profileObj.name,
      dateOfBirth: formatDate(profileObj.dateOfBirth),
      gender: profileObj.gender,
      email: profileObj.email,
      industryType: profileObj.industryType?.name || null,
      jobProfile: profileObj.jobProfile?.name || null,
      address: profileObj.address,
      state: profileObj.state?.state || null,
      city: profileObj.city,
      pincode: profileObj.pincode,
      panCardNumber: profileObj.panCardNumber,
      alternatePhoneNumber: profileObj.alternatePhoneNumber,
      image: profileObj.image
    };

    return res.status(200).json({
      status: true,
      message: "Job seeker profile fetched successfully.",
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

exports.updateProfileImage = async (req, res) => {
  try {
    const { userId, role } = req.user;

     console.log("Incoming Request User:", req.user);
    console.log("Uploaded File Details:", req.file);

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can update their profile image."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: false,
        message: "Image file is required."
      });
    }

    const profile = await JobSeekerProfile.findOne({ userId });
     console.log("Fetched Profile from DB:", profile);

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Job seeker profile not found."
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
        console.log("⚠ No old image to delete or same filename uploaded");
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
      message: "Job seeker profile image updated successfully. Old image deleted if it existed.",
      data: {
        image: newImagePath
      }
    });


  } catch (error) {
    console.error("Error updating job seeker profile image:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};

exports.getProfileImage = async (req, res) => {
  try {
    const { userId, role } = req.user;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can fetch their profile image."
      });
    }

    const profile = await JobSeekerProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Job seeker profile not found."
      });
    }

    return res.status(200).json({
      status: true,
      message: "Job seeker profile image fetched successfully.",
      data: {
        image: profile.image || null
      }
    });
  } catch (error) {
    console.error("Error fetching job seeker profile image:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};



exports.deleteProfile = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { id } = req.body;

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can delete their profiles."
      });
    }

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: false,
        message: "Valid profile ID is required."
      });
    }

    // Load the profile
    const profile = await JobSeekerProfile.findById(id);

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Job seeker profile not found."
      });
    }

    // AuthZ check
    if (profile.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to delete this profile."
      });
    }

    // Already soft-deleted?
    if (profile.isDeleted) {
      return res.status(400).json({
        status: false,
        message: "This profile is already soft deleted."
      });
    }

    // Soft delete
    profile.isDeleted = true;
    await profile.save();

    return res.status(200).json({
      status: true,
      message: "Job seeker profile deleted successfully (soft delete)."
    });
  } catch (error) {
    console.error("Error deleting job seeker profile:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};


// exports.deleteProfile = async (req, res) => {
//   try {
//     const { userId, role } = req.user;
//     const { id } = req.body;

//     if (role !== "job_seeker") {
//       return res.status(403).json({
//         status: false,
//         message: "Only job seekers can delete their profiles."
//       });
//     }

//     if (!id) {
//       return res.status(400).json({
//         status: false,
//         message: "Profile ID is required."
//       });
//     }

   
//     const profile = await JobSeekerProfile.findById(id);

//     if (!profile) {
//       return res.status(404).json({
//         status: false,
//         message: "Job seeker profile not found."
//       });
//     }

   
//     if (profile.userId.toString() !== userId.toString()) {
//       return res.status(403).json({
//         status: false,
//         message: "You are not authorized to delete this profile."
//       });
//     }

   
//     profile.isDeleted = true;
//     await profile.save();

//     return res.status(200).json({
//       status: true,
//       message: "Job seeker profile deleted successfully (soft delete)."
//     });

//   } catch (error) {
//     console.error("Error deleting job seeker profile:", error);
//     res.status(500).json({
//       status: false,
//       message: "Server error.",
//       error: error.message
//     });
//   }
// };





