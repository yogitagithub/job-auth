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

    const { taskId, employerApprovedTask } = req.body || {};
    const hasRemarks = Object.prototype.hasOwnProperty.call(req.body, "remarks");
    const remarksFromReq = hasRemarks ? String(req.body.remarks ?? "").trim() : undefined;

    if (!taskId || !mongoose.isValidObjectId(taskId)) {
      return res.status(400).json({ status: false, message: "Valid taskId is required." });
    }
    if (typeof employerApprovedTask !== "undefined" && !ALLOWED_APPROVAL.includes(employerApprovedTask)) {
      return res.status(400).json({
        status: false,
        message: `employerApprovedTask must be one of ${ALLOWED_APPROVAL.join(", ")}.`,
      });
    }

    const task = await Task.findById(taskId).populate({
      path: "jobApplicationId",
      select: "userId jobPostId employerApprovalStatus",
      model: JobApplication,
    });
    if (!task) return res.status(404).json({ status: false, message: "Task not found." });

    // Ownership (admin bypass)
    if (role !== "admin") {
      const jobPost = await JobPost.findOne({ _id: task.jobApplicationId.jobPostId, userId }).select("_id");
      if (!jobPost) {
        return res.status(403).json({ status: false, message: "You are not authorized for this task." });
      }
    }

    // Application must already be employer-approved
    if (task.jobApplicationId.employerApprovalStatus !== "Approved") {
      return res.status(409).json({
        status: false,
        message: "Candidate is not employer-approved for this job application.",
      });
    }

    // Apply approval if present
    if (typeof employerApprovedTask !== "undefined") {
      task.employerApprovedTask = employerApprovedTask;
    }

    // What will approval be after this call?
    const finalApproval =
      typeof employerApprovedTask !== "undefined" ? employerApprovedTask : task.employerApprovedTask;

    // Remarks rules
    if (hasRemarks) {
      if (finalApproval !== "Approved") {
        // Sending remarks when NOT Approved is forbidden
        return res.status(409).json({
          status: false,
          message:
            finalApproval === "Rejected"
              ? "You cannot add remarks when a task is Rejected."
              : "You can add remarks only after the task is Approved.",
        });
      }

      // finalApproval === "Approved"
      if (remarksFromReq.length > 2000) {
        return res.status(400).json({ status: false, message: "remarks must be ≤ 2000 characters." });
      }

      // remarks are optional: set only if provided (including empty string to clear if you want)
      task.remarks = remarksFromReq;                 // allow empty "" to clear, or remove this line if you never want to clear
      task.remarksAddedAt = new Date();
      task.remarksAddedBy = userId;
    }

    // Prevent "no-op" updates
    if (typeof employerApprovedTask === "undefined" && !hasRemarks) {
      return res.status(400).json({
        status: false,
        message: "Nothing to update. Send employerApprovedTask and/or remarks.",
      });
    }

    await task.save();

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
      remarks: task.employerApprovedTask === "Approved" && task.remarks ? task.remarks : null,
      submittedAt: formatDateDDMMYYYY(task.submittedAt),
    };

    let msg = "Task updated.";
    if (typeof employerApprovedTask !== "undefined" && hasRemarks) {
      msg = "Task approval and remarks updated.";
    } else if (typeof employerApprovedTask !== "undefined") {
      msg = "Task status updated.";
    } else if (hasRemarks) {
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

    // 🧩 Role check
    if (role !== "employer" && role !== "admin") {
      return res.status(403).json({
        status: false,
        message: "Only employers or admin can update isPaid status.",
      });
    }

    // 🧾 Validate payload
    if (typeof isPaid !== "boolean") {
      return res.status(400).json({
        status: false,
        message: "isPaid must be a boolean value.",
      });
    }

    // 🔍 Find task and populate related data
    const task = await Task.findById(taskId).populate({
      path: "jobApplicationId",
      // ⬅️ include hourlyRate here
      select: "jobPostId jobSeekerId hourlyRate",
      populate: {
        path: "jobPostId",
        model: "JobPost",
        select: "userId companyId", // minSalary not needed anymore
      },
    });

    if (!task) {
      return res.status(404).json({
        status: false,
        message: "Task not found.",
      });
    }

    const jobPost = task.jobApplicationId?.jobPostId;
    if (!jobPost) {
      return res.status(400).json({
        status: false,
        message: "Broken link: JobApplication → JobPost.",
      });
    }

    // 🛡️ Ownership check (employer restriction)
    if (role !== "admin") {
      const owns =
        jobPost.userId instanceof mongoose.Types.ObjectId
          ? jobPost.userId.equals(userId)
          : String(jobPost.userId) === String(userId);

      if (!owns) {
        return res.status(403).json({
          status: false,
          message: "You can only update isPaid for your own job post tasks.",
        });
      }
    }

    // 🚫 Cannot mark paid if not approved
    if (isPaid === true && task.employerApprovedTask !== "Approved") {
      return res.status(409).json({
        status: false,
        message: "Cannot mark paid. Task must be employer-approved first.",
      });
    }

    // ✅ Update task payment flag
    task.isPaid = isPaid;
    await task.save();

    // 💰 If paid, create NEW payment document for this task only
    let paymentDoc = null;
    if (isPaid === true) {
      const jobApplicationId = task.jobApplicationId._id;
      const jobSeekerId = task.jobApplicationId.jobSeekerId;
      const companyId = jobPost.companyId;

      // ⚡ Use hourlyRate from JobApplication
      const hourlyRate = Number(task.jobApplicationId.hourlyRate || 0);
      const hoursWorked = Number(task.hoursWorked || 0);
      const totalAmount = Number((hoursWorked * hourlyRate).toFixed(2));

      // Fetch related names
      const [company, seeker] = await Promise.all([
        CompanyProfile.findById(companyId).select("companyName name"),
        JobSeekerProfile.findById(jobSeekerId).select(
          "fullName firstName lastName name"
        ),
      ]);

      const employerName =
        company?.companyName || company?.name || "Employer";
      const jobSeekerName =
        seeker?.fullName ||
        [seeker?.firstName, seeker?.lastName].filter(Boolean).join(" ") ||
        seeker?.name ||
        "Job Seeker";

      // ✨ Create new payment document
      paymentDoc = await Payment.create({
        jobApplicationId,
        employerId: companyId,
        employerName,
        jobSeekerId,
        jobSeekerName,
        totalHours: hoursWorked,
        totalAmount,          // ✅ hoursWorked * hourlyRate
        taskId: task._id,     // optional: keep link to task
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return res.json({
      status: true,
      message: paymentDoc
        ? "New payment record created and task marked as paid."
        : "Task payment status updated successfully.",
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
    console.error("❌ Error in updateTaskPayment:", err);
    return res.status(500).json({
      status: false,
      message: err?.message || "Server error while updating task payment.",
    });
  }
};


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

    // ---- employer scoping: restrict by CompanyProfile owned by this user
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

    // ---- count
    const totalRecord = await Payment.countDocuments(match);

    // ---- fetch payments
    const payments = await Payment.find(match)
      .sort({ createdAt: -1, _id: -1 })
      .skip((p - 1) * l)
      .limit(l)
      // populate only what we need to derive names + hourlyRate
      .populate({
        path: "employerId",
        model: "CompanyProfile",
        select: "companyName name",
      })
      .populate({
        path: "jobSeekerId",
        model: "JobSeekerProfile",
        select: "fullName firstName lastName name",
      })
      .populate({
        path: "jobApplicationId",
        model: "JobApplication",
        select: "hourlyRate",
      })
      // we don't need stored totalAmount anymore; we will compute it
      .select("_id jobApplicationId employerId jobSeekerId totalHours")
      .lean();

    const totalPage = totalRecord ? Math.ceil(totalRecord / l) : 0;

    // ---- shape minimal items + compute totalAmount = totalHours * hourlyRate
    const paymentList = payments.map((doc) => {
      const company = doc.employerId || {};
      const seeker = doc.jobSeekerId || {};
      const jobApp = doc.jobApplicationId || {};

      const employerName = company.companyName || company.name || "Employer";
      const jobSeekerName =
        seeker.fullName ||
        [seeker.firstName, seeker.lastName].filter(Boolean).join(" ") ||
        seeker.name ||
        "Job Seeker";

      const totalHours = Number(doc.totalHours ?? 0);
      const hourlyRate = Number(jobApp.hourlyRate ?? 0); // from JobApplication
      const totalAmount = totalHours * hourlyRate;

      return {
        _id: String(doc._id),
        jobApplicationId: String(jobApp._id || doc.jobApplicationId),
        employerName,
        jobSeekerName,
        totalHours,
        totalAmount,
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
    console.error("getPaymentsList error:", err);
    return res
      .status(500)
      .json({ status: false, message: err?.message || "Server error." });
  }
};

exports.getApprovedCandidatePayment = async (req, res) => {
  try {
    const { userId, role } = req.user || {};
    if (!(role === "employer" || role === "admin")) {
      return res.status(403).json({
        status: false,
        message: "Only employers can access this data.",
      });
    }

    // ---------- Pagination ----------
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    // ---------- Step 1: Employer job posts ----------
    const jobPosts = await JobPost.find({ userId })
      .select("_id companyId")
      .populate("companyId", "companyName");

    if (!jobPosts.length) {
      return res.status(404).json({
        status: false,
        message: "No job posts found for this employer.",
      });
    }

    const jobPostIds = jobPosts.map((j) => j._id);

    // ---------- Step 2: Approved job applications ----------
    const jobApplications = await JobApplication.find({
      jobPostId: { $in: jobPostIds },
      employerApprovalStatus: "Approved",
    })
      .select("jobPostId jobSeekerId userId hourlyRate")
      .populate("jobSeekerId", "_id name userId")
      .populate("userId", "_id name email");

    if (!jobApplications.length) {
      return res.status(404).json({
        status: false,
        message: "No approved job applications found.",
      });
    }

    // ---------- Step 3: Build results ----------
    const allResults = [];

    for (const app of jobApplications) {
      const tasks = await Task.find({
        jobApplicationId: app._id,
        employerApprovedTask: "Approved",
      }).select("hoursWorked");

      if (!tasks.length) continue;

      const totalHours = tasks.reduce(
        (sum, t) => sum + (t.hoursWorked || 0),
        0
      );

      const jobPost = jobPosts.find(
        (p) => String(p._id) === String(app.jobPostId)
      );

      const employerName = jobPost?.companyId?.companyName || "";

      // ---------- hourlyRate from JobApplication ----------
      const hourlyRate = Number(app.hourlyRate ?? 0);

      // ---------- totalAmount = totalHours * hourlyRate ----------
      const totalAmount = Number((totalHours * hourlyRate).toFixed(2));

      // ---------- jobSeekerName ----------
      let jobSeekerName = "";
      if (app.jobSeekerId?.name) {
        jobSeekerName = app.jobSeekerId.name;
      } else if (app.userId?.name) {
        jobSeekerName = app.userId.name;
      }

      allResults.push({
        jobApplicationId: app._id,
        employerName,
        jobSeekerName,
        totalHours,
        totalAmount, // <-- ONLY THIS RETURNS
      });
    }

    if (!allResults.length) {
      return res.status(404).json({
        status: false,
        message: "No approved tasks found.",
      });
    }

    // ---------- Pagination ----------
    const totalRecord = allResults.length;
    const totalPage = Math.max(1, Math.ceil(totalRecord / limit));
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const approvedPaymentList = allResults.slice(startIndex, endIndex);

    return res.status(200).json({
      status: true,
      message: "Payments fetched successfully.",
      data: {
        totalRecord,
        totalPage,
        currentPage: page,
        approvedPaymentList,
      },
    });
  } catch (error) {
    console.error("getApprovedCandidatePayment error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Server error",
    });
  }
};



exports.getSeekerPaymentHistory = async (req, res) => {
  try {
    const { role, userId } = req.user || {};

    // Only job seekers allowed
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view payment history."
      });
    }

    // Find job seeker profile
    const jobSeeker = await JobSeekerProfile.findOne({
      userId,
      isDeleted: false
    }).select("_id");

    if (!jobSeeker) {
      return res.status(404).json({
        status: false,
        message: "Job seeker profile not found."
      });
    }

    // Pagination setup
    const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
    const limit = parseInt(req.query.limit) > 0 ? parseInt(req.query.limit) : 10;
    const skip = (page - 1) * limit;

    // Filter only non-deleted payments
    const filter = {
      jobSeekerId: jobSeeker._id,
      isDeleted: false
    };

    const [totalRecord, payments] = await Promise.all([
      Payment.countDocuments(filter),
      Payment.find(filter)
        .populate({
          path: "employerId",
          select: "companyName"
        })
        .populate({
          path: "jobApplicationId",
          select: "jobPostId",
          populate: {
            path: "jobPostId",
            select: "jobTitle"
          }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    // Calculate total hours and total amount
    const totalHours = payments.reduce((sum, p) => sum + (p.totalHours || 0), 0);
    const totalAmount = payments.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

    // Transform data (exclude totalHours and totalAmount from each record)
    const paymentHistoryList = payments.map((p) => ({
      _id: p._id.toString(),
      jobApplicationId: p.jobApplicationId?._id?.toString() || null,
      employerName:
        p.employerId?.companyName ||
        p.jobApplicationId?.jobPostId?.companyName ||
        "Unknown",
      jobTitle: p.jobApplicationId?.jobPostId?.jobTitle || null
    }));

    const totalPage = limit ? Math.ceil(totalRecord / limit) : 1;
    const currentPage = limit ? Math.min(page, totalPage || 1) : 1;

    // Final response
    return res.status(200).json({
      status: true,
      message: "Payments fetched successfully.",
      data: {
        totalRecord,
        totalPage,
        currentPage,
        paymentHistoryList,
        totalHours,
        totalAmount
      }
    });
  } catch (err) {
    console.error("getSeekerPaymentHistory error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message
    });
  }
};




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




