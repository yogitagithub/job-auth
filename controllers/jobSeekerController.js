const JobSeekerProfile = require("../models/JobSeekerProfile");

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

    let profile = await JobSeekerProfile.findOne({ userId });

   
    if (req.body.dateOfBirth) {
      const regex = /^\d{2}-\d{2}-\d{4}$/;
      if (!regex.test(req.body.dateOfBirth)) {
        return res.status(400).json({
          status: false,
          message: "dateOfBirth must be in DD-MM-YYYY format."
        });
      }
      const [day, month, year] = req.body.dateOfBirth.split("-");
      req.body.dateOfBirth = new Date(`${year}-${month}-${day}`);
    }

    if (!profile) {
     
      const { image, ...restFields } = req.body;

      profile = new JobSeekerProfile({
        userId,
        phoneNumber,
        ...restFields
      });

      await profile.save();

      return res.status(201).json({
        status: true,
        message: "Job seeker profile created successfully.",
        data: profile
      });
    }

   
    const restrictedFields = ["_id", "userId", "phoneNumber", "__v", "image"];
    Object.keys(req.body).forEach((field) => {
      if (restrictedFields.includes(field)) return;
      profile[field] = req.body[field];
    });

    await profile.save();

    return res.status(200).json({
      status: true,
      message: "Job seeker profile updated successfully.",
      data: profile
    });
  } catch (error) {
    console.error("Error creating/updating job seeker profile:", error);
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
      industry: profileObj.industry,
      jobProfile: profileObj.jobProfile,
      address: profileObj.address,
      state: profileObj.state,
      state: profileObj.state,
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

    if (!profile) {
      return res.status(404).json({
        status: false,
        message: "Job seeker profile not found."
      });
    }

    // Construct public URL
    const imagePath = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    profile.image = imagePath;
    await profile.save();

    // return res.status(200).json({
    //   status: true,
    //   message: "Job seeker profile image updated successfully.",
     
    //     image: imagePath
     
    // });

     return res.status(200).json({
      status: true,
      message: "Job seeker profile image updated successfully.",
      data: {
        image: imagePath
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



