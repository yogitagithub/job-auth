const JobSeekerProfile = require("../models/JobSeekerProfile");
const IndustryType = require("../models/AdminIndustry");
const JobProfile = require("../models/AdminJobProfile");
const StateCity = require("../models/StateCity");

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

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

  
    if (req.body.industryType) {
      const industry = await IndustryType.findOne({ name: req.body.industryType });
      if (!industry) {
        return res.status(400).json({ status: false, message: "Invalid industry type name." });
      }
      req.body.industryType = industry._id;
    }

   
    if (req.body.jobProfile) {
      const jobProfileDoc = await JobProfile.findOne({ name: req.body.jobProfile });
      if (!jobProfileDoc) {
        return res.status(400).json({ status: false, message: "Invalid job profile name." });
      }
      req.body.jobProfile = jobProfileDoc._id;
    }

   
    if (req.body.state && req.body.city) {
      const stateDoc = await StateCity.findOne({ state: req.body.state });
      if (!stateDoc) {
        return res.status(400).json({ status: false, message: "Invalid state name." });
      }

      if (!stateDoc.cities.includes(req.body.city)) {
        return res.status(400).json({ status: false, message: "Invalid city for the selected state." });
      }

      req.body.state = stateDoc._id;
    } else {
      return res.status(400).json({ status: false, message: "State and city are required." });
    }

   
    if (req.body.dateOfBirth) {
      const regex = /^\d{2}-\d{2}-\d{4}$/;
      if (!regex.test(req.body.dateOfBirth)) {
        return res.status(400).json({ status: false, message: "dateOfBirth must be in DD-MM-YYYY format." });
      }
      const [day, month, year] = req.body.dateOfBirth.split("-");
      req.body.dateOfBirth = new Date(`${year}-${month}-${day}`);
    }

   
    let profile = await JobSeekerProfile.findOne({ userId });

    if (!profile) {
     
      const { image, ...restFields } = req.body;
      profile = new JobSeekerProfile({ userId, phoneNumber, ...restFields });
      await profile.save();

      const populatedProfile = await JobSeekerProfile.findById(profile._id)
        .populate("industryType", "name")
        .populate("state", "state")
        .populate("jobProfile", "name");

      return res.status(201).json({
        status: true,
        message: "Job seeker profile created successfully.",
        data: {
          ...populatedProfile.toObject(),
          industryType: populatedProfile.industryType?.name || null,
          state: populatedProfile.state?.state || null,
          jobProfile: populatedProfile.jobProfile?.name || null,

            dateOfBirth: populatedProfile.dateOfBirth 
      ? populatedProfile.dateOfBirth.toISOString().split("T")[0] 
      : null,

          city: populatedProfile.city
        }
      });
    }

    
    const restrictedFields = ["_id", "userId", "phoneNumber", "__v", "image"];
    Object.keys(req.body).forEach((field) => {
      if (!restrictedFields.includes(field)) profile[field] = req.body[field];
    });

    await profile.save();

    const populatedProfile = await JobSeekerProfile.findById(profile._id)
      .populate("industryType", "name")
      .populate("state", "state")
      .populate("jobProfile", "name");

    return res.status(200).json({
      status: true,
      message: "Job seeker profile updated successfully.",
      data: {
        ...populatedProfile.toObject(),
        industryType: populatedProfile.industryType?.name || null,
        state: populatedProfile.state?.state || null,
        jobProfile: populatedProfile.jobProfile?.name || null,

          dateOfBirth: populatedProfile.dateOfBirth 
      ? populatedProfile.dateOfBirth.toISOString().split("T")[0]
      : null,

        city: populatedProfile.city
      }
    });

  } catch (error) {
    console.error("Error creating/updating job seeker profile:", error);
    res.status(500).json({ status: false, message: "Server error.", error: error.message });
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

   
    function formatDate(date) {
      if (!date) return null;
      const d = new Date(date);
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const year = d.getUTCFullYear();
      return `${year}-${month}-${day}`;
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

    return res.json({
      status: true,
      message: "Job seeker profile fetched successfully.",
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

    if (!id) {
      return res.status(400).json({
        status: false,
        message: "Profile ID is required."
      });
    }

   
    const profile = await JobSeekerProfile.findById(id);

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Job seeker profile not found."
      });
    }

   
    if (profile.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to delete this profile."
      });
    }

   
    profile.isDeleted = true;
    await profile.save();

    return res.status(200).json({
      status: true,
      message: "Job seeker profile deleted successfully (soft delete)."
    });

  } catch (error) {
    console.error("Error deleting job seeker profile:", error);
    res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};





