
const mongoose = require("mongoose");

const STATUS = ["On Track", "Off Track", "At Risk"]; // display order only

const taskSchema = new mongoose.Schema(
  {
    jobApplicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobApplication",
      required: true,
      index: true,
    },

    title: { type: String, required: true },
    description: { type: String, required: true },
    // fileUrl: { type: String },

    // ---- Time tracking ----
    startTime: { type: Date },           // set when user starts
    endTime: { type: Date },             // set when user ends
    workedHours: { type: Number, default: 0 }, // auto-computed (hours, decimals allowed)

    // ---- Progress & status ----
    progressPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    status: {
      type: String,
      enum: ["On Track", "Off Track", "At Risk"],
      default: "At Risk",
    },

     employerApprovedTask: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending"
     
    },


    isPaid: {
  type: Boolean,
  default: false,
},


   

    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Map percent -> status: [0,70) = At Risk, [70,90) = Off Track, [90,100] = On Track
function mapStatus(p) {
  if (p >= 90) return "On Track";
  if (p >= 70) return "Off Track";
  return "At Risk";
}

// Recompute derived fields before save
taskSchema.pre("save", function (next) {
  // compute workedHours if both times exist
  if (this.startTime && this.endTime) {
    if (this.endTime < this.startTime) {
      return next(new Error("endTime cannot be before startTime"));
    }
    const diffMs = this.endTime - this.startTime;
    // round to 2 decimals
    this.workedHours = Math.round((diffMs / 36e5) * 100) / 100;
  }

  // compute status from progress
  if (typeof this.progressPercent === "number") {
    this.status = mapStatus(this.progressPercent);
  }

  next();
});

module.exports = mongoose.model("Task", taskSchema);
