const SplashScreen = require('../models/SplashScreen');


exports.createOrUpdateSplashScreen = async (req, res) => {
  try {
    const { splashId, title, description } = req.body;
    let image;

    console.log("Incoming splashId:", splashId);

    if (req.file) {
      image = `/uploads/images/${req.file.filename}`;
    }

    let splashScreen;
    if (splashId) {
      splashScreen = await SplashScreen.findById(splashId);
      if (!splashScreen) {
        return res.status(404).json({
          status: false,
          message: "Splash screen not found with the provided ID."
        });
      }

   
      splashScreen.title = title || splashScreen.title;
      splashScreen.description = description || splashScreen.description;
      splashScreen.image = image || splashScreen.image;
      await splashScreen.save();
    } else {
    
      if (!title || !description || !image) {
        return res.status(400).json({
          status: false,
          message: "Title, description, and image are required for creating a splash screen."
        });
      }
      splashScreen = await SplashScreen.create({ title, description, image });
    }

    res.status(200).json({
      status: true,
      message: splashId ? "Splash screen updated successfully" : "Splash screen created successfully",
      data: splashScreen,
    });
  } catch (error) {
    console.error("Error in createOrUpdateSplashScreen:", error);
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};


exports.getAllSplashScreens = async (req, res) => {
  try {
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

   
    const totalSplashScreens = await SplashScreen.countDocuments();

   
    const splashScreens = await SplashScreen.find()
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    if (!splashScreens || splashScreens.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No splash screens found."
      });
    }

   
    const responseData = splashScreens.map(screen => ({
      id: screen._id,
      title: screen.title,
      image: screen.image,
      description: screen.description,
      createdAt: screen.createdAt,
      updatedAt: screen.updatedAt
    }));

   
    return res.status(200).json({
      status: true,
      message: "Splash screens fetched successfully.",
      totalSplashScreens,
      currentPage: page,
      totalPages: Math.ceil(totalSplashScreens / limit),
      data: responseData
    });

  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Server error",
      error: error.message
    });
  }
};


exports.getSplashScreenById = async (req, res) => {
  try {
    const { id } = req.params;
    const splashScreen = await SplashScreen.findById(id);

    if (!splashScreen) {
      return res.status(404).json({ status: false, message: "Splash screen not found" });
    }

    res.status(200).json({ status: true, message: "Splash screen fetched successfully", data: splashScreen });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};


exports.deleteSplashScreen = async (req, res) => {
  try {
    const { id } = req.params;
    const splashScreen = await SplashScreen.findByIdAndDelete(id);

    if (!splashScreen) {
      return res.status(404).json({ status: false, message: "Splash screen not found" });
    }

    res.status(200).json({ status: true, message: "Splash screen deleted successfully" });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};
