const StateCity = require("../models/StateCity");

exports.getAllStates = async (req, res) => {
  try {
    const states = await StateCity.find().select("state -_id");
    res.status(200).json({
      status: true,
      message: "States fetched successfully.",
      data: states.map(s => s.state)
    });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error" });
  }
};

exports.getCitiesByState = async (req, res) => {
  try {
    const { state } = req.query;
    if (!state) return res.status(400).json({ status: false, message: "State is required" });

    const result = await StateCity.findOne({ state });
    if (!result) return res.status(404).json({ status: false, message: "State not found" });

    res.status(200).json({ status: true, data: result.cities });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error" });
  }
};


exports.getAllStatesPublic = async (req, res) => {
  try {
    const states = await StateCity.find()
      .select("state -_id")
      .sort({ state: 1 })
      .lean();

    return res.status(200).json({
      status: true,
      message: "States fetched successfully.",
      data: states.map(s => s.state)
    });
  } catch (error) {
    console.error("Error fetching states:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: error.message
    });
  }
};

exports.getCitiesByStatePublic = async (req, res) => {
  try {
    const { state } = req.query;

    // Case 1: state=null OR not provided -> return all cities
    if (!state || state === "null") {
      const allStates = await StateCity.find()
        .select("state cities -_id")
        .lean();

      // flatten all cities
      const allCities = allStates.flatMap(s => s.cities || []);

      return res.status(200).json({
        status: true,
        message: "All cities fetched successfully.",
        data: allCities
      });
    }

    // Case 2: specific state
    const result = await StateCity.findOne({ state: state.trim() })
      .select("state cities -_id")
      .lean();

    if (!result) {
      return res
        .status(404)
        .json({ status: false, message: "State not found" });
    }

    return res.status(200).json({
      status: true,
      message: "Cities fetched successfully.",
      data: {
        state: result.state,
        cities: result.cities || []
      }
    });
  } catch (error) {
    console.error("Error fetching cities:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: error.message
    });
  }
};

