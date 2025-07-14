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
      message: "Job seeker profile updated successfully",
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

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view their profiles."
      });
    }

    const profile = await JobSeekerProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Job seeker profile not found."
      });
    }

     const profileObj = profile.toObject();

       const responseData = {
      id: profileObj._id,
      userId: profileObj.userId,
      phoneNumber: profileObj.phoneNumber,
      name: profileObj.name,
      dateOfBirth: profileObj.dateOfBirth,
      gender: profileObj.gender,
      email: profileObj.email,
      industry: profileObj.industry,
      jobProfile: profileObj.jobProfile,
      address: profileObj.address,
      state: profileObj.state,
      state: profileObj.state,
      city: profileObj.city,
      pincode: profileObj.pincode
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



