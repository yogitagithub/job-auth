const mongoose = require("mongoose");
const Task = require("../models/Task");
const JobApplication = require("../models/JobApplication");
const JobPost = require("../models/JobPost");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const CompanyProfile = require("../models/CompanyProfile");
const Payment = require("../models/payment");




// turn "14:00:00", "14:00", "2 pm", "02:30 PM" into a Date for today
function parseTimeToToday(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const s = timeStr.trim();

  // Match 24h or 12h with optional seconds and AM/PM
  const m = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)?$/i.exec(s);
  if (!m) return null;

  let [ , hh, mm = "0", ss = "0", ap ] = m;
  let hours = parseInt(hh, 10);
  const minutes = parseInt(mm, 10);
  const seconds = parseInt(ss, 10);

  if (ap) {
    const ampm = ap.toUpperCase();
    if (hours === 12) hours = 0;
    if (ampm === "PM") hours += 12;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
    return null;
  }

  const d = new Date();
  d.setHours(hours, minutes, seconds, 0); // server's local TZ
  return d;
}


const pad2 = (n) => String(n).padStart(2, "0");

const formatDateDDMMYYYY = (d) => {
  const dt = new Date(d);
  return `${pad2(dt.getDate())}-${pad2(dt.getMonth() + 1)}-${dt.getFullYear()}`;
};

const formatTimeHHMMSS = (d) => {
  const dt = new Date(d);             // local time (IST on your server)
  return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;
};

const formatHours = (h) => {
  const v = Number(h ?? 0);
  // 1.5 -> "1.5 hours", 1 -> "1 hour"
  return `${v} ${v === 1 ? "hour" : "hours"}`;
};

const formatINR = (v) => `₹ ${Number(v || 0).toFixed(2)}`;




//task upload by job seeker
exports.uploadTask = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, role } = req.user || {};
    if (role !== "job_seeker") {
      await session.abortTransaction(); session.endSession();
      return res.status(403).json({ status: false, message: "Only job seekers can create tasks." });
    }

    const {
      jobApplicationId,
      title,
      description,
      startTime: startTimeStr,
      endTime: endTimeStr,
      progressPercent,
       hoursWorked: hoursWorkedRaw,
    } = req.body || {};

    if (!jobApplicationId || !title || !description) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ status: false, message: "jobApplicationId, title and description are required." });
    }

    // must have an uploaded file (saved by uploadCertificate.single('file'))
    if (!req.file) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ status: false, message: "No file uploaded." });
    }


    

    // profile must exist
    const profile = await JobSeekerProfile.findOne({ userId, isDeleted: false })
      .select("_id")
      .session(session);
    if (!profile) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ status: false, message: "Please complete your job seeker profile first." });
    }

    // job application must belong to this user
    const jobApp = await JobApplication.findById(jobApplicationId).session(session);
    if (!jobApp) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ status: false, message: "Job application not found." });
    }
    if (String(jobApp.userId) !== String(userId)) {
      await session.abortTransaction(); session.endSession();
      return res.status(403).json({ status: false, message: "You can only create tasks for your own job applications." });
    }

    
// ✅ NEW: only allow if employer has approved the application
if (jobApp.employerApprovalStatus !== "Approved") {
  await session.abortTransaction(); session.endSession();
  return res.status(403).json({
    status: false,
    message: "Your job application is not approved by the employer yet. You can upload tasks only after approval."
  });
}

    // build public file URL
    const BASE = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const fileUrl = `${BASE}/uploads/certificates/${req.file.filename}`;

    // use YOUR parseTimeToToday helper (accepts "07:00", "7 PM", "07:00:00", etc.)
    let startTime, endTime;
    if (startTimeStr) {
      startTime = parseTimeToToday(String(startTimeStr));
      if (!startTime) {
        await session.abortTransaction(); session.endSession();
        return res.status(400).json({ status: false, message: "Invalid startTime format." });
      }
    }
    if (endTimeStr) {
      endTime = parseTimeToToday(String(endTimeStr));
      if (!endTime) {
        await session.abortTransaction(); session.endSession();
        return res.status(400).json({ status: false, message: "Invalid endTime format." });
      }
    }

     // ---- decide hoursWorked ----
    let hoursWorkedFinal;
    if (startTime && endTime) {
      if (endTime < startTime) {
        await session.abortTransaction(); session.endSession();
        return res.status(400).json({ status: false, message: "endTime cannot be before startTime." });
      }
      const diffHrs = (endTime - startTime) / (1000 * 60 * 60);
      hoursWorkedFinal = Number(Math.max(0, diffHrs).toFixed(2)); // e.g., 3.00
    } else {
      // only required when start/end are not both provided
      if (hoursWorkedRaw === undefined || hoursWorkedRaw === null || String(hoursWorkedRaw).trim() === "") {
        await session.abortTransaction(); session.endSession();
        return res.status(400).json({ status: false, message: "hoursWorked is required when startTime/endTime are not provided." });
      }
      hoursWorkedFinal = Number(hoursWorkedRaw);
    }

    if (!Number.isFinite(hoursWorkedFinal) || hoursWorkedFinal < 0 || hoursWorkedFinal > 24) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ status: false, message: "hoursWorked must be a number between 0 and 24." });
    }

    const payload = {
      jobApplicationId,
      title,
      description,
      fileUrl,
       hoursWorked: hoursWorkedFinal,  
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
    };

    if (progressPercent !== undefined && progressPercent !== null) {
      const p = Number(progressPercent);
      if (Number.isNaN(p) || p < 0 || p > 100) {
        await session.abortTransaction(); session.endSession();
        return res.status(400).json({ status: false, message: "progressPercent must be 0–100." });
      }
      payload.progressPercent = p; // status auto-mapped in Task pre('save')
    }

   // Use .save() so pre('save') sets status from progress
    const created = await new Task(payload).save({ session });

    await session.commitTransaction(); session.endSession();

       const responseWorkedHours =
      (created.startTime && created.endTime && typeof created.workedHours === "number" && created.workedHours > 0)
        ? created.workedHours
        : created.hoursWorked;

    return res.status(200).json({
      status: true,
      message: "Task created successfully.",
      data: {
        _id: created._id,
        title: created.title,
        description: created.description,
        fileUrl: created.fileUrl,
        startTime: created.startTime,
        endTime: created.endTime,
     hoursWorked: created.hoursWorked, 
        progressPercent: created.progressPercent,  
        status: created.status,                   
        employerApprovedTask: created.employerApprovedTask,
        submittedAt: created.submittedAt,
        createdAt: created.createdAt,
      }
    });
  } catch (error) {
    await session.abortTransaction(); session.endSession();
    const msg = error.code === "LIMIT_FILE_SIZE" ? "File too large. Max 5MB." : (error.message || "Server error.");
    return res.status(500).json({ status: false, message: msg });
  }
};

const ALLOWED_APPROVAL = ["Pending", "Approved", "Rejected"];

//update task by employer
exports.updateTask = async (req, res) => {
  try {
    const { role, userId } = req.user || {};
    if (!(role === "employer" || role === "admin")) {
      return res.status(403).json({ status: false, message: "Only employers can update tasks." });
    }

    const { taskId, employerApprovedTask, isRemarksAdded, remarks } = req.body || {};

    // --- Basic validations ---
    if (!taskId || !mongoose.isValidObjectId(taskId)) {
      return res.status(400).json({ status: false, message: "Valid taskId is required." });
    }

    // If approval is being sent, validate value
    if (typeof employerApprovedTask !== "undefined" && !ALLOWED_APPROVAL.includes(employerApprovedTask)) {
      return res.status(400).json({
        status: false,
        message: `employerApprovedTask must be one of ${ALLOWED_APPROVAL.join(", ")}.`,
      });
    }

    // If remarks toggle is being sent, validate boolean
    if (typeof isRemarksAdded !== "undefined" && typeof isRemarksAdded !== "boolean") {
      return res.status(400).json({ status: false, message: "isRemarksAdded must be boolean." });
    }

    // Load task and related application (need jobPostId + app approval)
    const task = await Task.findById(taskId).populate({
      path: "jobApplicationId",
      select: "userId jobPostId employerApprovalStatus",
      model: JobApplication,
    });
    if (!task) return res.status(404).json({ status: false, message: "Task not found." });

    // Ownership: employer must own the job post (admin bypass)
    if (role !== "admin") {
      const jobPost = await JobPost.findOne({ _id: task.jobApplicationId.jobPostId, userId }).select("_id");
      if (!jobPost) {
        return res.status(403).json({ status: false, message: "You are not authorized for this task." });
      }
    }

    // Application must itself be employer-approved
    if (task.jobApplicationId.employerApprovalStatus !== "Approved") {
      return res.status(409).json({
        status: false,
        message: "Candidate is not employer-approved for this job application.",
      });
    }

    // --- Apply updates (approval first, then remarks rules) ---
    let updatedSomething = false;

    // 1) Update approval if provided
    if (typeof employerApprovedTask !== "undefined") {
      task.employerApprovedTask = employerApprovedTask;
      updatedSomething = true;
    }

    // Determine what the approval will be *after* this request
    const finalApproval = typeof employerApprovedTask !== "undefined"
      ? employerApprovedTask
      : task.employerApprovedTask;

    // 2) Update remarks if provided
    if (typeof isRemarksAdded !== "undefined") {
      if (isRemarksAdded === true) {
        // remarks can be added only if task is Approved (now or already)
        if (finalApproval !== "Approved") {
          return res.status(409).json({
            status: false,
            message: "You can add remarks only after the task is Approved.",
          });
        }

        const txt = String(remarks || "").trim();
        if (!txt) {
          return res.status(400).json({
            status: false,
            message: "remarks is required when isRemarksAdded is true.",
          });
        }
        if (txt.length > 2000) {
          return res.status(400).json({
            status: false,
            message: "remarks must be ≤ 2000 characters.",
          });
        }

        task.isRemarksAdded = true;
        task.remarks = txt;
        task.remarksAddedAt = new Date();
        task.remarksAddedBy = userId;
        updatedSomething = true;
      } else {
        // Turning OFF remarks clears fields
        task.isRemarksAdded = false;
        task.remarks = "";
        task.remarksAddedAt = null;
        task.remarksAddedBy = null;
        updatedSomething = true;
      }
    }

    if (!updatedSomething) {
      return res.status(400).json({
        status: false,
        message: "Nothing to update. Send employerApprovedTask and/or isRemarksAdded (+ remarks).",
      });
    }

    await task.save();

    // --- Response payload (same shape you used) ---
    const data = {
      _id: task._id,
      jobApplicationId: task.jobApplicationId?._id || task.jobApplicationId,
      title: task.title,
      description: task.description,
      startTime: task.startTime ? formatTimeHHMMSS(task.startTime) : null,
      endTime: task.endTime ? formatTimeHHMMSS(task.endTime) : null,
      hoursWorked: formatHours(task.hoursWorked),
      progressPercent: `${Number(task.progressPercent)}%`,
      status: task.status,
      employerApprovedTask: task.employerApprovedTask,
      isRemarksAdded: task.isRemarksAdded,
      remarks: task.isRemarksAdded ? task.remarks : null,
      submittedAt: formatDateDDMMYYYY(task.submittedAt),
    };

    // Friendly message depending on what changed
    let msg = "Task updated.";
    if (typeof employerApprovedTask !== "undefined" && typeof isRemarksAdded !== "undefined") {
      msg = "Task approval and remarks updated.";
    } else if (typeof employerApprovedTask !== "undefined") {
      msg = "Task approval status updated.";
    } else if (typeof isRemarksAdded !== "undefined") {
      msg = "Remarks updated.";
    }

    return res.json({ status: true, message: msg, data });
  } catch (err) {
    return res.status(500).json({ status: false, message: err?.message || "Server error." });
  }
};




//details of updated task view by employer and job seeker
exports.updatedTaskDetails = async (req, res) => {
  try {
    const { role, userId } = req.user || {};
    const { jobApplicationId } = req.params || {};

    if (!jobApplicationId || !mongoose.isValidObjectId(jobApplicationId)) {
      return res.status(400).json({ status: false, message: "Valid jobApplicationId is required." });
    }

    // Load the application to verify ownership and to get jobPostId
    const jobApp = await JobApplication
      .findById(jobApplicationId)
      .select("_id userId jobPostId employerApprovalStatus")
      .lean();

    if (!jobApp) {
      return res.status(404).json({ status: false, message: "Job application not found." });
    }

    // Role-based access control
    if (role === "job_seeker") {
      if (String(jobApp.userId) !== String(userId)) {
        return res.status(403).json({ status: false, message: "Not authorized for this application." });
      }
    } else if (role === "employer" || role === "admin") {
      // Verify employer owns the job post (skip for admin)
      if (role !== "admin") {
        const owns = await JobPost.exists({ _id: jobApp.jobPostId, userId });
        if (!owns) {
          return res.status(403).json({ status: false, message: "Not authorized for this job post." });
        }
      }
    } else {
      return res.status(403).json({ status: false, message: "Access denied." });
    }


     // Fetch jobPost along with company
    const jobPost = await JobPost.findById(jobApp.jobPostId)
      .populate("companyId", "companyName") // <- populate companyId to get companyName
      .select("hourlyRate jobTitle companyId")
      .lean();

      const hourlyRate = Number(jobPost?.hourlyRate || 0);
    const companyName = jobPost?.companyId?.companyName || null;


     // ✅ Fetch JobSeekerProfile with jobProfile populated
    const seeker = await JobSeekerProfile.findOne({ userId: jobApp.userId })
      .populate("jobProfile", "name") // assumes JobProfile has "name" field
      .select("jobProfile")
      .lean();


       const jobProfileName = seeker?.jobProfile?.name || null;

    // Aggregate approved tasks for this application
    const agg = await Task.aggregate([
      {
        $match: {
          jobApplicationId: new mongoose.Types.ObjectId(jobApplicationId),
          employerApprovedTask: "Approved",
        },
      },
      {
        $group: {
          _id: null,
          totalHours: { $sum: "$workedHours" },
          approvedCount: { $sum: 1 },
        },
      },
    ]);

    const totalHours = agg.length ? Math.round(agg[0].totalHours * 100) / 100 : 0;
    const approvedCount = agg.length ? agg[0].approvedCount : 0;
    const totalSalary = Math.round((totalHours * hourlyRate) * 100) / 100;

   
  

    return res.json({
      status: true,
      message: "Completed task summary fetched successfully.",
       data: {
    jobApplicationId,
    jobTitle: jobPost?.jobTitle || null,
       companyName, 
        jobProfile: jobProfileName,
    approvedTasks: approvedCount,
    totalWorkedHours: formatHours(totalHours), // e.g., "5 hours"
    hourlyRate: formatINR(hourlyRate),        // e.g., "₹ 200.00"
    totalSalary: formatINR(totalSalary)       // e.g., "₹ 1000.00"
  }
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err?.message || "Server error." });
  }
};

exports.updateTaskPayment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { isPaid } = req.body;
    const { userId, role } = req.user;

    if (role !== "employer" && role !== "admin") {
      return res.status(403).json({ status: false, message: "Only employers can update isPaid status." });
    }
    if (typeof isPaid !== "boolean") {
      return res.status(400).json({ status: false, message: "isPaid must be a boolean." });
    }

    const task = await Task.findById(taskId).populate({
      path: "jobApplicationId",
      select: "jobPostId jobSeekerId",
      populate: { path: "jobPostId", model: "JobPost", select: "userId companyId minSalary" },
    });
    if (!task) return res.status(404).json({ status: false, message: "Task not found." });

    const jobPost = task.jobApplicationId?.jobPostId;
    if (!jobPost) return res.status(400).json({ status: false, message: "Broken link: JobApplication → JobPost." });

    if (role !== "admin") {
      const owns = jobPost.userId instanceof mongoose.Types.ObjectId
        ? jobPost.userId.equals(userId)
        : String(jobPost.userId) === String(userId);
      if (!owns) return res.status(403).json({ status: false, message: "You can only update isPaid for your own job post tasks." });
    }

    // 🚫 Block setting isPaid=true unless the task is Approved
    if (isPaid === true && task.employerApprovedTask !== "Approved") {
      return res.status(409).json({
        status: false,
        message: "Cannot mark paid. Task must be employer-approved first.",
       
      });
    }

    // ✅ Allowed: set true (already approved) or set false
    task.isPaid = isPaid;
    await task.save();

    // If paid & approved → upsert Payment summary (same as before)
    let paymentDoc = null;
    if (isPaid === true) {
      const jobApplicationId = task.jobApplicationId._id;
      const jobSeekerId = task.jobApplicationId.jobSeekerId;
      const companyId = jobPost.companyId;
      const hourlyRate = Number(jobPost.minSalary || 0);

      const sum = await Task.aggregate([
        { $match: {
            jobApplicationId: new mongoose.Types.ObjectId(String(jobApplicationId)),
            employerApprovedTask: "Approved",
            isPaid: true
        }},
        { $group: { _id: null, hours: { $sum: "$hoursWorked" } } }
      ]);
      const totalHours = Number(sum?.[0]?.hours || 0);
      const totalAmount = Number((totalHours * hourlyRate).toFixed(2));

      const [company, seeker] = await Promise.all([
        CompanyProfile.findById(companyId).select("companyName name"),
        JobSeekerProfile.findById(jobSeekerId).select("firstName lastName fullName name"),
      ]);

      const employerName = company?.companyName || company?.name || "Employer";
      const jobSeekerName = seeker?.fullName
        || [seeker?.firstName, seeker?.lastName].filter(Boolean).join(" ")
        || seeker?.name
        || "Job Seeker";

      paymentDoc = await Payment.findOneAndUpdate(
        { jobApplicationId },
        { employerId: companyId, employerName, jobSeekerId, jobSeekerName, totalHours, totalAmount },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    }

    return res.json({
      status: true,
      message: paymentDoc ? "Task payment status updated." : "Task payment status updated.",
      data: {
        _id: task._id,
        title: task.title,
        description: task.description,
        startTime: task.startTime,
        endTime: task.endTime,
        hoursWorked: task.hoursWorked,
        progressPercent: task.progressPercent,
        status: task.status,
        employerApprovedTask: task.employerApprovedTask,
        isPaid: task.isPaid,
        submittedAt: task.submittedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err?.message || "Server error." });
  }
};

//payment list
const toInt = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

exports.getPaymentsList = async (req, res) => {
  try {
    const { role, userId } = req.user || {};
    const { page = 1, limit = 10, jobApplicationId, jobSeekerId } = req.query;

    const p = toInt(page, 1);
    const l = Math.min(toInt(limit, 10), 100);

    // ---- base match
    const match = { isDeleted: false };

    if (jobApplicationId && mongoose.isValidObjectId(jobApplicationId)) {
      match.jobApplicationId = new mongoose.Types.ObjectId(jobApplicationId);
    }
    if (jobSeekerId && mongoose.isValidObjectId(jobSeekerId)) {
      match.jobSeekerId = new mongoose.Types.ObjectId(jobSeekerId);
    }

    // ---- employer scoping (no aggregation): restrict by CompanyProfile owned by this user
    if (role !== "admin") {
      const company = await CompanyProfile.findOne({ userId }).select("_id");
      if (!company) {
        return res.status(403).json({
          status: false,
          message: "Company profile not found for this employer.",
        });
      }
      match.employerId = company._id;
    }

    // ---- count + fetch
    const totalRecord = await Payment.countDocuments(match);

    const payments = await Payment.find(match)
      .sort({ createdAt: -1, _id: -1 })
      .skip((p - 1) * l)
      .limit(l)
      // populate only what we need to derive names
      .populate({ path: "employerId", model: "CompanyProfile", select: "companyName name" })
      .populate({ path: "jobSeekerId", model: "JobSeekerProfile", select: "fullName firstName lastName name" })
      .select("_id jobApplicationId employerId jobSeekerId totalHours totalAmount") // project to essentials
      .lean();

    const totalPage = totalRecord ? Math.ceil(totalRecord / l) : 0;

    // ---- shape minimal items
    const paymentList = payments.map((doc) => {
      const company = doc.employerId || {};
      const seeker = doc.jobSeekerId || {};

      const employerName = company.companyName || company.name || "Employer";
      const jobSeekerName =
        seeker.fullName ||
        [seeker.firstName, seeker.lastName].filter(Boolean).join(" ") ||
        seeker.name ||
        "Job Seeker";

      return {
        _id: String(doc._id),
        jobApplicationId: String(doc.jobApplicationId),
        employerName,
        jobSeekerName,
        totalHours: Number(doc.totalHours ?? 0),
        totalAmount: Number(doc.totalAmount ?? 0),
      };
    });

    return res.json({
      status: true,
      message: "Payments fetched successfully.",
      data: {
        totalRecord,
        totalPage,
        currentPage: p,
        paymentList,
      },
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err?.message || "Server error." });
  }
};

//payment details
exports.getPaymentDetails = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { role, userId } = req.user;

    if (!mongoose.isValidObjectId(paymentId)) {
      return res.status(400).json({ status: false, message: "Invalid paymentId." });
    }

    // --- Fetch payment ---
    const payment = await Payment.findById(paymentId)
      .populate({ path: "employerId", model: "CompanyProfile", select: "companyName name" })
      .populate({ path: "jobSeekerId", model: "JobSeekerProfile", select: "fullName firstName lastName name" })
      .populate({ path: "jobApplicationId", model: "JobApplication", select: "jobPostId userId" })
      .lean();

    if (!payment) {
      return res.status(404).json({ status: false, message: "Payment not found." });
    }

    // --- Employer authorization ---
    if (role !== "admin") {
      const employerCompany = await CompanyProfile.findOne({ userId }).select("_id");
      if (!employerCompany || String(employerCompany._id) !== String(payment.employerId._id)) {
        return res.status(403).json({ status: false, message: "Not authorized to view this payment." });
      }
    }

    // --- Fetch tasks under this jobApplicationId that are paid ---
    const tasks = await Task.find({
      jobApplicationId: payment.jobApplicationId._id,
      isPaid: true
    })
      .select("title description hoursWorked progressPercent status employerApprovedTask submittedAt")
      .sort({ createdAt: -1 })
      .lean();

    // --- Format names ---
    const employerName = payment.employerId.companyName || payment.employerId.name || "Employer";
    const jobSeekerName =
      payment.jobSeekerId.fullName ||
      [payment.jobSeekerId.firstName, payment.jobSeekerId.lastName].filter(Boolean).join(" ") ||
      payment.jobSeekerId.name ||
      "Job Seeker";

    // --- Response ---
    return res.json({
      status: true,
      message: "Payment details fetched successfully.",
      data: {
        paymentInfo: {
          _id: String(payment._id),
          jobApplicationId: String(payment.jobApplicationId._id),
          employerName,
          jobSeekerName,
          totalHours: payment.totalHours,
          totalAmount: payment.totalAmount,
        },
        taskList: tasks.map(t => ({
          _id: String(t._id),
          title: t.title,
          description: t.description,
          hoursWorked: t.hoursWorked,
          progressPercent: t.progressPercent,
          status: t.status,
          employerApprovedTask: t.employerApprovedTask,
          submittedAt: t.submittedAt
        }))
      }
    });

  } catch (err) {
    return res.status(500).json({ status: false, message: err?.message || "Server error." });
  }
};





exports.getMyTasks = async (req, res) => {
  try {
    const { role, userId } = req.user || {};
    if (!["job_seeker", "employer"].includes(role)) {
      return res.status(403).json({
        status: false,
        message: "Only job seekers or employers can view tasks.",
      });
    }

    const { applicationId } = req.params || {};

    // ----- pagination -----
    const pageParam = parseInt(req.query.page, 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

    const limitRaw = (req.query.limit || "").toString().toLowerCase();
    const limit =
      limitRaw === "all"
        ? 0
        : (() => {
            const n = parseInt(limitRaw || "10", 10);
            if (!Number.isFinite(n) || n < 1) return 10;
            return Math.min(n, 100);
          })();
    const skip = limit ? (page - 1) * limit : 0;

    // ----- resolve application scope -> appIds -----
    let appIds = [];

    if (applicationId) {
      // Specific application: validate & authorize
      if (!mongoose.isValidObjectId(applicationId)) {
        return res.status(400).json({ status: false, message: "Invalid applicationId." });
      }

      const appDoc = await JobApplication.findById(applicationId)
        .select("_id userId jobPostId")
        .lean();

      if (!appDoc) {
        return res.status(404).json({ status: false, message: "Job application not found." });
      }

      if (role === "job_seeker") {
        if (String(appDoc.userId) !== String(userId)) {
          return res.status(403).json({ status: false, message: "Not authorized for this application." });
        }
      } else {
        // employer must own the job post
        const owns = await JobPost.exists({ _id: appDoc.jobPostId, userId, isDeleted: false });
        if (!owns) {
          return res.status(403).json({ status: false, message: "Not authorized for this application." });
        }
      }

      appIds = [appDoc._id];
    } else {
      // All apps in scope (by role)
      let appFilter;
      if (role === "job_seeker") {
        appFilter = { userId };
      } else {
        const myPosts = await JobPost.find({ userId, isDeleted: false }).select("_id").lean();
        if (!myPosts.length) {
          return res.status(200).json({
            status: true,
            message: "Tasks fetched successfully.",
            totalRecord: 0,
            totalPage: 1,
            currentPage: 1,
            data: [],
          });
        }
        appFilter = { jobPostId: { $in: myPosts.map(p => p._id) } };
      }

      const apps = await JobApplication.find(appFilter).select("_id").lean();
      if (!apps.length) {
        return res.status(200).json({
          status: true,
          message: "Tasks fetched successfully.",
          totalRecord: 0,
          totalPage: 1,
          currentPage: 1,
          data: [],
        });
      }
      appIds = apps.map(a => a._id);
    }

    // ----- fetch tasks in scope -----
    const taskFilter = { jobApplicationId: { $in: appIds } };


      // NEW: filter by employerApprovedTask
    const VALID_TYPES = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
    const rawType = req.query.type;

    if (typeof rawType !== "undefined" && rawType !== null && String(rawType).trim() !== "") {
      // allow single, multiple, comma-separated, or repeated query params
      const arr = Array.isArray(rawType) ? rawType : String(rawType).split(",");
      const normalized = Array.from(new Set(
        arr.map(t => String(t).trim().toLowerCase()).map(t => VALID_TYPES[t]).filter(Boolean)
      ));
      if (normalized.length === 1) {
        taskFilter.employerApprovedTask = normalized[0];
      } else if (normalized.length > 1) {
        taskFilter.employerApprovedTask = { $in: normalized };
      } else {
        // if only invalid values were provided, return empty result instead of error
        return res.status(200).json({
          status: true,
          message: "Tasks fetched successfully.",
          totalRecord: 0,
          totalPage: 1,
          currentPage: 1,
          data: [],
        });
      }
    }

    const totalRecord = await Task.countDocuments(taskFilter);

    const tasks = await Task.find(taskFilter)
      .select(
        "jobApplicationId title description fileUrl startTime endTime hoursWorked progressPercent status employerApprovedTask submittedAt"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit || 0)
      .populate({
        path: "jobApplicationId",
        select: "jobPostId",
        populate: {
          path: "jobPostId",
          select: "jobTitle companyId",
          populate: {
            path: "companyId",
            select: "companyName image",
          },
        },
      })
      .lean();

    // ----- response shape -----
    const data = tasks.map(t => {
      const app = t.jobApplicationId || null;
      const jp  = app && app.jobPostId ? app.jobPostId : null;
      const co  = jp && jp.companyId ? jp.companyId : null;

      const jobApplicationId =
        app && app._id ? String(app._id) : (t.jobApplicationId ? String(t.jobApplicationId) : null);

      const fileUrl =
        t.fileUrl && String(t.fileUrl).trim() !== "" ? t.fileUrl : null;

        

      return {
        taskId: String(t._id),
        jobApplicationId,

        jobTitle: jp ? jp.jobTitle || null : null,
        companyName: co ? co.companyName || null : null,
        companyImage: co ? co.image || null : null,

        title: t.title,
        description: t.description,
        fileUrl,                                        // null when missing/empty

       startTime: t.startTime ? formatTimeHHMMSS(t.startTime) : "",
        endTime:   t.endTime   ? formatTimeHHMMSS(t.endTime)   : "",

         // only one field now
        hoursWorked: typeof t.hoursWorked === "number" ? t.hoursWorked : 0,
        
        progressPercent: t.progressPercent,
        status: t.status,
        employerApprovedTask: t.employerApprovedTask,

        submittedDate: t.submittedAt ? formatDateDDMMYYYY(t.submittedAt) : null,
      };
    });

    const totalPage = limit && totalRecord > 0 ? Math.ceil(totalRecord / limit) : 1;
    const currentPage = limit ? Math.min(page, totalPage || 1) : 1;

    return res.status(200).json({
      status: true,
      message: "Tasks fetched successfully.",
      totalRecord,
      totalPage,
      currentPage,
      data,
    });
  } catch (err) {
    console.error("getMyTasks error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message,
    });
  }
};


//get only approved task
exports.getApprovedTasks = async (req, res) => {
  try {
    const { role, userId } = req.user || {};
    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can view approved tasks from this endpoint."
      });
    }

    const { applicationId } = req.params || {};
    if (!mongoose.isValidObjectId(applicationId)) {
      return res.status(400).json({ status: false, message: "Invalid applicationId." });
    }

    // ---- pagination ----
    const pageParam = parseInt(req.query.page, 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

    const limitRaw = (req.query.limit || "").toString().toLowerCase();
    const limit =
      limitRaw === "all"
        ? 0
        : (() => {
            const n = parseInt(limitRaw || "10", 10);
            if (!Number.isFinite(n) || n < 1) return 10;
            return Math.min(n, 100);
          })();
    const skip = limit ? (page - 1) * limit : 0;

    // ---- authorize employer for this application ----
    const appDoc = await JobApplication.findById(applicationId)
      .select("_id userId jobPostId")
      .lean();

    if (!appDoc) {
      return res.status(404).json({ status: false, message: "Job application not found." });
    }

    const owns = await JobPost.exists({ _id: appDoc.jobPostId, userId, isDeleted: false });
    if (!owns) {
      return res.status(403).json({ status: false, message: "Not authorized for this application." });
    }

    // ---- fetch only APPROVED tasks for this application ----
    const taskFilter = {
      jobApplicationId: appDoc._id,
      employerApprovedTask: "Approved"
    };

    const totalRecord = await Task.countDocuments(taskFilter);

    const tasks = await Task.find(taskFilter)
      .select(
        "jobApplicationId title description fileUrl startTime endTime hoursWorked progressPercent status employerApprovedTask submittedAt"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit || 0)
      .populate({
        path: "jobApplicationId",
        select: "jobPostId",
        populate: {
          path: "jobPostId",
          select: "jobTitle companyId",
          populate: {
            path: "companyId",
            select: "companyName image"
          }
        }
      })
      .lean();

    // ---- shape response (same fields/order as your sample) ----
    const taskList = tasks.map(t => {
      const app = t.jobApplicationId || null;
      const jp  = app && app.jobPostId ? app.jobPostId : null;
      const co  = jp && jp.companyId ? jp.companyId : null;

      const jobApplicationId =
        app && app._id ? String(app._id) : (t.jobApplicationId ? String(t.jobApplicationId) : null);

      const fileUrl = t.fileUrl && String(t.fileUrl).trim() !== "" ? t.fileUrl : null;

      return {
        taskId: String(t._id),
        jobApplicationId,
        jobTitle: jp ? jp.jobTitle || null : null,
        companyName: co ? co.companyName || null : null,
        companyImage: co ? co.image || null : null,
        title: t.title,
        description: t.description,
        fileUrl,
        startTime: t.startTime ? formatTimeHHMMSS(t.startTime) : "",
        endTime:   t.endTime   ? formatTimeHHMMSS(t.endTime)   : "",
        hoursWorked: typeof t.hoursWorked === "number" ? t.hoursWorked : 0,
        progressPercent: t.progressPercent,
        status: t.status,
        employerApprovedTask: t.employerApprovedTask, // will always be "Approved"
        submittedDate: t.submittedAt ? formatDateDDMMYYYY(t.submittedAt) : null
      };
    });

    const totalPage = limit && totalRecord > 0 ? Math.ceil(totalRecord / limit) : 1;
    const currentPage = limit ? Math.min(page, totalPage || 1) : 1;

    return res.status(200).json({
      status: true,
      message: "Approved tasks fetched successfully.",
     data: { 
      
      totalRecord,
      totalPage,
      currentPage,
     
      taskList
     }
    });
  } catch (err) {
    console.error("getApprovedTasks error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};




