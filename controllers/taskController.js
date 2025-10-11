const mongoose = require("mongoose");
const Task = require("../models/Task");
const JobApplication = require("../models/JobApplication");
const JobPost = require("../models/JobPost");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const CompanyProfile = require("../models/CompanyProfile");




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



//get all the task 
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

          // prefer computed workedHours; fallback to hoursWorked; else 0
      const worked = (typeof t.workedHours === "number" && t.workedHours > 0)
        ? t.workedHours
        : (typeof t.hoursWorked === "number" ? t.hoursWorked : 0);

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
