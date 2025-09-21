const mongoose = require("mongoose");
const Task = require("../models/Task");
const JobApplication = require("../models/JobApplication");
const JobPost = require("../models/JobPost");
const JobSeekerProfile = require("../models/JobSeekerProfile");



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


//update isPaid field by employer only
exports.updateTaskPayment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { isPaid } = req.body;
    const { userId, role } = req.user; // from verifyToken

    // 0) Validate role & input
    if (role !== "employer") {
      return res.status(403).json({
        status: false,
        message: "Only employers can update isPaid status.",
      });
    }
    if (typeof isPaid !== "boolean") {
      return res.status(400).json({
        status: false,
        message: "isPaid must be a boolean.",
      });
    }

    // 1) Load task → jobApplication → jobPost(userId) to verify ownership
    const task = await Task.findById(taskId).populate({
      path: "jobApplicationId",
      select: "jobPostId",
      populate: { path: "jobPostId", model: "JobPost", select: "userId" },
    });

    if (!task) {
      return res.status(404).json({ status: false, message: "Task not found." });
    }

    const ownerId = task?.jobApplicationId?.jobPostId?.userId;
    if (!ownerId) {
      return res.status(400).json({
        status: false,
        message:
          "Job post owner not found. Check JobApplication.jobPostId and JobPost.userId links.",
      });
    }

    const ownerMatches =
      ownerId instanceof mongoose.Types.ObjectId
        ? ownerId.equals(userId)
        : String(ownerId) === String(userId);

    if (!ownerMatches) {
      return res.status(403).json({
        status: false,
        message: "You can only update isPaid for your own job post tasks.",
      });
    }

    // 2) Update field (only isPaid)
    task.isPaid = isPaid;
    await task.save();

    // 3) Build clean response (no __v, createdAt, updatedAt, jobApplicationId)
    const data = {
      _id: task._id,
      title: task.title,
      description: task.description,
      startTime: task.startTime,
      endTime: task.endTime,
      workedHours: task.workedHours,
      progressPercent: task.progressPercent,
      status: task.status,
      employerApprovedTask: task.employerApprovedTask,
      isPaid: task.isPaid,
      submittedAt: task.submittedAt,
    };

    return res.json({
      status: true,
      message: "Task payment status updated successfully.",
      data,
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};


