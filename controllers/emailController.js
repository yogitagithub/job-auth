const mongoose = require("mongoose");
const { Types } = mongoose;

const SavedEmail = require("../models/SavedEmail");
const { sendBulkEmail } = require("../config/emailService");



exports.saveEmail = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { email } = req.body;

    // -------- ROLE CHECK --------
    if (!["employer", "job_seeker"].includes(role)) {
      return res.status(403).json({
        status: false,
        message: "Unauthorized role."
      });
    }

    // -------- EMAIL VALIDATION --------
    if (!email || !email.trim()) {
      return res.status(400).json({
        status: false,
        message: "Email is required."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        status: false,
        message: "Invalid email format."
      });
    }

    // -------- SAVE EMAIL --------
    const saved = await SavedEmail.findOneAndUpdate(
      { userId, email: normalizedEmail },
      {
        userId,
        role,
        email: normalizedEmail
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      status: true,
      message: "Email saved successfully.",
      data: {
        id: saved._id,
        email: saved.email,
        role: saved.role,
        createdAt: saved.createdAt
      }
    });

  } catch (error) {
    console.error("saveEmail error:", error);

    // Duplicate index safety
    if (error.code === 11000) {
      return res.status(200).json({
        status: true,
        message: "Email already saved."
      });
    }

    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};


//admin can access only to get the list of saved emails

exports.getAllSavedEmails = async (req, res) => {
  try {
    const { role } = req.user;

    // ---------- ADMIN CHECK ----------
    if (role !== "admin") {
      return res.status(403).json({
        status: false,
        message: "Only admin can access saved emails."
      });
    }

    // ---------- PAGINATION ----------
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    // ---------- OPTIONAL ROLE FILTER ----------
    const filter = {};
    if (req.query.role) {
      filter.role = req.query.role; // employer | job_seeker
    }

    // ---------- FETCH ----------
    const [emails, totalRecord] = await Promise.all([
      SavedEmail.find(filter)
        .select("email role createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      SavedEmail.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalRecord / limit);

    return res.status(200).json({
      status: true,
      message: "Saved emails fetched successfully.",
      totalRecord,
      currentPage: page,
      totalPages,
      data: emails
    });

  } catch (error) {
    console.error("getAllSavedEmails error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};


//broadcasting message to all the emails

exports.sendEmailToAllSavedUsers = async (req, res) => {
  try {
    const { role } = req.user;

    // ---------- ADMIN CHECK ----------
    if (role !== "admin") {
      return res.status(403).json({
        status: false,
        message: "Only admin can send emails."
      });
    }

    const { subject, message } = req.body;

    if (!message) {
      return res.status(400).json({
        status: false,
        message: "Message text is required."
      });
    }

    // ---------- FETCH EMAILS ----------
    const emails = await SavedEmail.find({})
      .select("email -_id")
      .lean();

    if (!emails.length) {
      return res.status(404).json({
        status: false,
        message: "No saved emails found."
      });
    }

    const emailList = emails.map(e => e.email);

    // ---------- SEND EMAIL ----------
    await sendBulkEmail({
      to: emailList.join(","),   // Nodemailer accepts comma-separated
      subject: subject || "Notification",
      text: message
    });

    return res.status(200).json({
      status: true,
      message: "Email sent successfully to all saved users.",
      totalEmails: emailList.length
    });

  } catch (error) {
    console.error("sendEmailToAllSavedUsers error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error.",
      error: error.message
    });
  }
};


