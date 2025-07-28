const StateCity = require("../models/StateCity");

// exports.getAllStates = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10; // Default limit 10
//     const skip = (page - 1) * limit;

//     const totalRecord = await StateCity.countDocuments(); // total states
//     const totalPage = Math.ceil(totalRecord / limit);

//     const statesData = await StateCity.find()
//       .select("state -_id")
//       .skip(skip)
//       .limit(limit);

//     const states = statesData.map((s) => s.state);

//     res.status(200).json({
//       status: true,
//       message: "States fetched successfully.",
//       totalRecord,
//       totalPage,
//       currentPage: page,
//       data: states,
//     });
//   } catch (error) {
//     console.error("Error fetching states:", error);
//     res.status(500).json({ status: false, message: "Server error" });
//   }
// };


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
