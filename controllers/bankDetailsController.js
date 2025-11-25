const BankDetails = require("../models/BankDetails");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const AccountType = require("../models/AdminAccountType");
const mongoose = require("mongoose");


const IFSC_RE = /^[A-Z]{4}0[0-9A-Z]{6}$/i;


const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

exports.createBank = async (req, res) => {
  try {
    const { userId, role } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({ status: false, message: "Only job seekers can add bank details." });
    }

    let { accountHolderName, accountNumber, ifscCode, branchName, accountType } = req.body || {};

    // ---- Basic validation ----
    accountHolderName = String(accountHolderName || "").trim();
    if (!accountHolderName) {
      return res.status(400).json({ status: false, message: "accountHolderName is required." });
    }

    if (accountNumber === undefined || accountNumber === null || accountNumber === "") {
      return res.status(400).json({ status: false, message: "accountNumber is required." });
    }
    const accountNumberNum = Number(accountNumber);
    if (!Number.isFinite(accountNumberNum)) {
      return res.status(400).json({ status: false, message: "accountNumber must be a number." });
    }

    ifscCode = String(ifscCode || "").trim().toUpperCase();
    if (!IFSC_RE.test(ifscCode)) {
      return res.status(400).json({
        status: false,
        message: "Invalid IFSC code. Expected pattern: XXXX0YYYYYY (11 chars)."
      });
    }

    branchName = String(branchName || "").trim() || null;

    // ---- Enforce: accountType MUST be a NAME, not an ObjectId ----
    if (!accountType) {
      return res.status(400).json({ status: false, message: "accountType name is required." });
    }
    if (mongoose.isValidObjectId(accountType)) {
      return res.status(400).json({
        status: false,
        message: "Pass accountType by name only (not id)."
      });
    }

    const acctTypeName = String(accountType).trim();
    const acctTypeDoc = await AccountType.findOne({
      isDeleted: false,
      name: { $regex: "^" + escapeRegex(acctTypeName) + "$", $options: "i" }
    }).select("_id name");

    if (!acctTypeDoc) {
      return res.status(400).json({
        status: false,
        message: "Invalid accountType name or accountType is inactive."
      });
    }

    // ---- Ensure job seeker profile exists ----
    const jsProfile = await JobSeekerProfile.findOne({ userId, isDeleted: false }).select("_id");
    if (!jsProfile) {
      return res.status(400).json({
        status: false,
        message: "Please create your job seeker profile before adding bank details."
      });
    }

    // ---- Enforce single active record per user ----
    const existingActive = await BankDetails.findOne({ userId, isDeleted: false });
    if (existingActive) {
      return res.status(409).json({
        status: false,
        message: "Bank details already exist. Use update API to modify."
      });
    }

    // ---- Revive soft-deleted record if present ----
    const existingSoft = await BankDetails.findOne({ userId, isDeleted: true });
    if (existingSoft) {
      existingSoft.accountHolderName = accountHolderName;
      existingSoft.accountNumber     = accountNumberNum;
      existingSoft.ifscCode          = ifscCode;
      existingSoft.branchName        = branchName;
      existingSoft.accountType       = acctTypeDoc._id;
      existingSoft.jobSeekerId       = jsProfile._id;
      existingSoft.isDeleted         = false;
      await existingSoft.save();

      return res.status(201).json({
        status: true,
        message: "Bank details restored successfully.",
        data: {
          id: existingSoft._id,
          accountHolderName: existingSoft.accountHolderName,
          accountNumber: existingSoft.accountNumber,
          ifscCode: existingSoft.ifscCode,
          branchName: existingSoft.branchName,
          accountType: acctTypeDoc.name
        }
      });
    }

    // ---- Create new ----
    const doc = await BankDetails.create({
      userId,
      jobSeekerId: jsProfile._id,
      accountHolderName,
      accountNumber: accountNumberNum,
      ifscCode,
      branchName,
      accountType: acctTypeDoc._id
    });

    return res.status(201).json({
      status: true,
      message: "Bank details added successfully.",
      data: {
        id: doc._id,
        accountHolderName: doc.accountHolderName,
        accountNumber: doc.accountNumber,
        ifscCode: doc.ifscCode,
        branchName: doc.branchName,
        accountType: acctTypeDoc.name 
      }
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Error creating bank details",
      error: err.message
    });
  }
};



exports.getMyBank = async (req, res) => {
  try {
    const { userId, role } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view bank details."
      });
    }

    // Try to fetch the single ACTIVE record
    const active = await BankDetails.findOne({ userId, isDeleted: false }).lean();

    if (!active) {
      // If no active, check if a soft-deleted record exists to return a clearer status
      const soft = await BankDetails.findOne({ userId, isDeleted: true }).select("_id").lean();
      if (soft) {
        return res.status(410).json({
          status: false,
          message: "Your bank details have been deleted and cannot be viewed."
        });
      }
      return res.status(404).json({
        status: false,
        message: "Bank details not found."
      });
    }

    // Resolve account type name (return name string only)
    let accountTypeName = null;
    if (active.accountType) {
      const typeDoc = await AccountType.findById(active.accountType).select("name").lean();
      accountTypeName = typeDoc?.name ?? null;
    }

    return res.status(200).json({
      status: true,
      message: "Bank details fetched successfully.",
      data: {
        id: active._id,
        accountHolderName: active.accountHolderName,
        accountNumber: active.accountNumber,
        ifscCode: active.ifscCode,
        branchName: active.branchName,
        accountType: accountTypeName
      }
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Error fetching bank details",
      error: err.message
    });
  }
};




exports.updateBankById = async (req, res) => {
  try {
    const { userId, role } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can update bank details."
      });
    }

    const { id } = req.body || {};
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid id is required." });
    }

    // Fetch the user's document (even if soft-deleted so we can signal properly)
    const doc = await BankDetails.findOne({ _id: id, userId });
    if (!doc) {
      return res.status(404).json({ status: false, message: "Bank details not found." });
    }

    if (doc.isDeleted) {
      return res.status(410).json({
        status: false,
        message: "This bank details record has been deleted and cannot be updated."
      });
    }

    // Accept partial updates
    let {
      accountHolderName,
      accountNumber,
      ifscCode,
      branchName,
      accountType, // must be NAME only
    } = req.body;

    // Track if anything is actually being updated
    let touched = false;

    // accountHolderName
    if (accountHolderName !== undefined) {
      const v = String(accountHolderName || "").trim();
      if (!v) {
        return res.status(400).json({ status: false, message: "accountHolderName cannot be empty." });
      }
      doc.accountHolderName = v;
      touched = true;
    }

    // accountNumber (Number in schema)
    if (accountNumber !== undefined) {
      if (accountNumber === null || accountNumber === "") {
        return res.status(400).json({ status: false, message: "accountNumber cannot be empty." });
      }
      const n = Number(accountNumber);
      if (!Number.isFinite(n)) {
        return res.status(400).json({ status: false, message: "accountNumber must be a number." });
      }
      doc.accountNumber = n;
      touched = true;
    }

    // IFSC (11 chars pattern)
    if (ifscCode !== undefined) {
      const v = String(ifscCode || "").trim().toUpperCase();
      if (!IFSC_RE.test(v)) {
        return res.status(400).json({
          status: false,
          message: "Invalid IFSC code. Expected pattern: XXXX0YYYYYY (11 chars)."
        });
      }
      doc.ifscCode = v;
      touched = true;
    }

    // branchName (nullable string)
    if (branchName !== undefined) {
      const v = String(branchName || "").trim();
      doc.branchName = v || null;
      touched = true;
    }

    // accountType by NAME only (case-insensitive)
    let accountTypeNameToReturn = null;
    if (accountType !== undefined) {
      if (mongoose.isValidObjectId(accountType)) {
        return res.status(400).json({
          status: false,
          message: "Pass accountType by name only (not id)."
        });
      }
      const name = String(accountType || "").trim();
      if (!name) {
        return res.status(400).json({ status: false, message: "accountType name cannot be empty." });
      }
      const typeDoc = await AccountType.findOne({
        isDeleted: false,
        name: { $regex: "^" + escapeRegex(name) + "$", $options: "i" }
      }).select("_id name");
      if (!typeDoc) {
        return res.status(400).json({
          status: false,
          message: "Invalid accountType name or accountType is inactive."
        });
      }
      doc.accountType = typeDoc._id;
      accountTypeNameToReturn = typeDoc.name;
      touched = true;
    }

    if (!touched) {
      return res.status(400).json({ status: false, message: "No valid fields provided to update." });
    }

    await doc.save();

    // If accountType wasn't updated, resolve its current name for response
    if (accountTypeNameToReturn === null && doc.accountType) {
      const typeDoc = await AccountType.findById(doc.accountType).select("name").lean();
      accountTypeNameToReturn = typeDoc?.name ?? null;
    }

    return res.status(200).json({
      status: true,
      message: "Bank details updated successfully.",
      data: {
        id: doc._id,
        accountHolderName: doc.accountHolderName,
        accountNumber: doc.accountNumber,
        ifscCode: doc.ifscCode,
        branchName: doc.branchName,
        accountType: accountTypeNameToReturn // return name only
      }
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Error updating bank details",
      error: err.message
    });
  }
};


exports.deleteBankById = async (req, res) => {
  try {
    const { userId, role } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can delete bank details."
      });
    }

    const { id } = req.body || {};
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Valid id is required." });
    }

    // Fetch the user's document (include soft-deleted to handle double-delete)
    const doc = await BankDetails.findOne({ _id: id, userId });
    if (!doc) {
      return res.status(404).json({ status: false, message: "Bank details not found." });
    }

    if (doc.isDeleted) {
      return res.status(410).json({
        status: false,
        message: "This bank details record has already deleted."
      });
    }

    doc.isDeleted = true;
    await doc.save();

    return res.status(200).json({
      status: true,
      message: "Bank details deleted successfully.",
      
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Error deleting bank details",
      error: err.message
    });
  }
};



