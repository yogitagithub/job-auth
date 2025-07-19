const jwt = require("jsonwebtoken");
const Category = require("../models/AdminCategory");
const IndustryType = require("../models/AdminIndustry");

// Static credentials (can be moved to env vars if preferred)
const ADMIN_EMAIL = "admin@gmail.com";
const ADMIN_PASSWORD = "admin123";

// POST /api/admin/login
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if email and password are provided
    if (!email || !password) {
      return res.status(400).json({
        status: false,
        message: "Email and password are required.",
      });
    }

    // Validate static credentials
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return res.status(401).json({
        status: false,
        message: "Invalid email or password.",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        email,
        role: "admin", // important for role-based access
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.status(200).json({
      status: true,
      message: "Admin logged in successfully.",
      token,
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error during login.",
    });
  }
};

//Category
exports.createCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ status: false, message: "Name required" });

    const category = new Category({ name });
    await category.save();

    res.status(201).json({ status: true, message: "Category created", data: category });
  } catch (err) {
    res.status(500).json({ status: false, message: "Error creating category", error: err.message });
  }
};

exports.getAdminCategory = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json({ status: true, data: categories });
  } catch (err) {
    res.status(500).json({ status: false, message: "Error fetching categories" });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const updated = await Category.findByIdAndUpdate(id, { name }, { new: true });
    if (!updated) return res.status(404).json({ status: false, message: "Category not found" });

    res.json({ status: true, message: "Updated successfully", data: updated });
  } catch (err) {
    res.status(500).json({ status: false, message: "Error updating category" });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Category.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ status: false, message: "Not found" });

    res.json({ status: true, message: "Category deleted" });
  } catch (err) {
    res.status(500).json({ status: false, message: "Error deleting category" });
  }
};

//Industry Type
exports.createIndustry = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ status: false, message: "Name required" });

    const industry = new IndustryType({ name });
    await industry.save();

    res.status(201).json({ status: true, message: "Industry type created", data: industry });
  } catch (err) {
    res.status(500).json({ status: false, message: "Error creating industry", error: err.message });
  }
};

exports.getAdminIndustry = async (req, res) => {
  try {
    const industries = await IndustryType.find().sort({ name: 1 });
    res.json({ status: true, data: industries });
  } catch (err) {
    res.status(500).json({ status: false, message: "Error fetching industries" });
  }
};

exports.updateIndustry = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const updated = await IndustryType.findByIdAndUpdate(id, { name }, { new: true });
    if (!updated) return res.status(404).json({ status: false, message: "Industry not found" });

    res.json({ status: true, message: "Updated successfully", data: updated });
  } catch (err) {
    res.status(500).json({ status: false, message: "Error updating industry" });
  }
};

exports.deleteIndustry = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await IndustryType.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ status: false, message: "Not found" });

    res.json({ status: true, message: "Industry deleted" });
  } catch (err) {
    res.status(500).json({ status: false, message: "Error deleting industry" });
  }
};

//get all employees
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });

    return res.status(200).json({
      status: true,
      message: "Categories fetched successfully.",
      data: categories
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return res.status(500).json({
      status: false,
      message: "Server error while fetching categories.",
      error: error.message
    });
  }
};



exports.getIndustry = async (req, res) => {
  try {
    const industries = await IndustryType.find().sort({ name: 1 });

    return res.status(200).json({
      status: true,
      message: "Industry types fetched successfully.",
      data: industries
    });
  } catch (error) {
    console.error("Error fetching industry types:", error);
    return res.status(500).json({
      status: false,
      message: "Server error while fetching industry types.",
      error: error.message
    });
  }
};


