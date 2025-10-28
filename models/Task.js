
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

    title: { type: String, 
      required: true 
    },
    
    description: { type: String, 
      required: true 
    },

     fileUrl: { type: String },

    // ---- Time tracking ----
    startTime: { type: Date },           // set when user starts
    endTime: { type: Date },             // set when user ends


    // Single source of truth for hours
    hoursWorked: { type: Number, required: true },

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

    isRemarksAdded: { 
    type: Boolean, 
    default: false 
  },


  // Task model (add under employerApprovedTask / isRemarksAdded)
remarks: { type: String, trim: true, maxlength: 2000, default: "" },
remarksAddedAt: { type: Date, default: null },
remarksAddedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },



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

// Keep only validations/derived status here (no workedHours calc)
taskSchema.pre("save", function (next) {
  if (this.startTime && this.endTime) {
    if (this.endTime < this.startTime) {
      return next(new Error("endTime cannot be before startTime"));
    }
  }
  if (typeof this.progressPercent === "number") {
    this.status = mapStatus(this.progressPercent);
  }
  next();
});



module.exports = mongoose.model("Task", taskSchema);
