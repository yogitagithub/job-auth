const mongoose = require("mongoose");
const Task = require("../models/Task");
const JobApplication = require("../models/JobApplication");
const JobPost = require("../models/JobPost");


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




//task upload by job seeker
exports.uploadTask = async (req, res) => {
  try {
    // 1) Role gate
    const { role, userId } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can upload tasks.",
      });
    }

    // 2) Parse & basic validation
    const {
      jobApplicationId,
      title,
      description,
      startTime,        // ISO string (optional)
      endTime,          // ISO string (optional)
      progressPercent,  // number 0..100 (optional)
    } = req.body || {};

    if (!jobApplicationId || !mongoose.isValidObjectId(jobApplicationId)) {
      return res.status(400).json({ status: false, message: "Valid jobApplicationId is required." });
    }
    if (!title || !description) {
      return res.status(400).json({ status: false, message: "title and description are required." });
    }

    // 3) Ensure the job application belongs to this user and is Approved
    const jobApp = await JobApplication.findOne({ _id: jobApplicationId, userId }).lean();
    if (!jobApp) {
      return res.status(404).json({ status: false, message: "Job application not found for this user." });
    }
    if (jobApp.employerApprovalStatus !== "Approved") {
      return res.status(403).json({
        status: false,
        message: "You are not approved by the employer to submit tasks for this job.",
      });
    }

    // 4) Prepare payload
    const doc = {
      jobApplicationId,
      title: String(title).trim(),
      description: String(description).trim(),
    };

   // Optional times (accept "HH:mm[:ss]" or "h[:mm[:ss]] AM/PM")
if (startTime) {
  const d = parseTimeToToday(startTime);
  if (!d) return res.status(400).json({ status: false, message: "Invalid startTime format." });
  doc.startTime = d;
}
if (endTime) {
  const d = parseTimeToToday(endTime);
  if (!d) return res.status(400).json({ status: false, message: "Invalid endTime format." });
  doc.endTime = d;
}


    // Optional progress (clamp to 0..100; schema will derive status)
    if (typeof progressPercent !== "undefined") {
      const p = Number(progressPercent);
      if (Number.isNaN(p)) {
        return res.status(400).json({ status: false, message: "progressPercent must be a number." });
      }
      doc.progressPercent = Math.min(100, Math.max(0, p));
    }

    // 5) Create task (pre-save hook will compute workedHours + status)
    const task = await Task.create(doc);


    // Build formatted payload for UI
const data = {
  _id: task._id,
  jobApplicationId: task.jobApplicationId,
  title: task.title,
  description: task.description,

  // formatted times (HH:mm:ss)
  startTime: task.startTime ? formatTimeHHMMSS(task.startTime) : null,
  endTime: task.endTime ? formatTimeHHMMSS(task.endTime) : null,

  // worked hours like "3 hours"
  workedHours: formatHours(task.workedHours),

  // percent with % sign
  progressPercent: `${Number(task.progressPercent)}%`,

  status: task.status,
  employerApprovedTask: task.employerApprovedTask,

  // dd-mm-yyyy
  submittedAt: formatDateDDMMYYYY(task.submittedAt),

  
};


    return res.status(201).json({
      status: true,
      message: "Task uploaded successfully.",
      data
    });
  } catch (err) {
    // Handle invalid date ordering (from your pre-save) and other errors
    const msg = err?.message || "Server error while uploading task.";
    return res.status(500).json({ status: false, message: msg });
  }
};

const ALLOWED_APPROVAL = ["Pending", "Approved", "Rejected"];

//update task by employer
exports.updateTask = async (req, res) => {
  try {
    const { role, userId } = req.user || {};
    if (!(role === "employer" || role === "admin")) {
      return res.status(403).json({ status: false, message: "Only employers can update task approvals." });
    }

    const { taskId, employerApprovedTask } = req.body || {};

    if (!taskId || !mongoose.isValidObjectId(taskId)) {
      return res.status(400).json({ status: false, message: "Valid taskId is required." });
    }
    if (!ALLOWED_APPROVAL.includes(employerApprovedTask)) {
      return res.status(400).json({
        status: false,
        message: `employerApprovedTask must be one of ${ALLOWED_APPROVAL.join(", ")}.`,
      });
    }

    // Load task with its JobApplication (need jobPostId to verify ownership)
    const task = await Task.findById(taskId).populate({
      path: "jobApplicationId",
      select: "userId jobPostId employerApprovalStatus",
      model: JobApplication,
    });
    if (!task) return res.status(404).json({ status: false, message: "Task not found." });

    // Verify this task belongs to a job post owned by this employer
    const jobPost = await JobPost.findOne({ _id: task.jobApplicationId.jobPostId, userId }).select("_id userId");
    if (!jobPost && role !== "admin") {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to approve/reject tasks for this job post.",
      });
    }

    // (Optional) Only allow approval if the job application itself was approved by employer
    if (task.jobApplicationId.employerApprovalStatus !== "Approved") {
      return res.status(409).json({
        status: false,
        message: "Candidate is not employer-approved for this job application.",
      });
    }

    task.employerApprovedTask = employerApprovedTask;
    await task.save();

    // formatted response
    const data = {
      _id: task._id,
      jobApplicationId: task.jobApplicationId._id || task.jobApplicationId,
      title: task.title,
      description: task.description,
      startTime: task.startTime ? formatTimeHHMMSS(task.startTime) : null,
      endTime: task.endTime ? formatTimeHHMMSS(task.endTime) : null,
      workedHours: formatHours(task.workedHours),
      progressPercent: `${Number(task.progressPercent)}%`,
      status: task.status,
      employerApprovedTask: task.employerApprovedTask,
      submittedAt: formatDateDDMMYYYY(task.submittedAt),
    };

    return res.json({ status: true, message: "Task approval status updated.", data });
  } catch (err) {
    return res.status(500).json({ status: false, message: err?.message || "Server error." });
  }
};