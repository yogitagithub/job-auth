const mongoose = require("mongoose");

const savedJobSchema = new mongoose.Schema(
    {
  userId:    { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
},    

  jobPostId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "JobPost", 
    required: true 
},

}, 
{ timestamps: true }
);

savedJobSchema.index({ userId: 1, jobPostId: 1 }, { unique: true });

module.exports = mongoose.model("SavedJob", savedJobSchema);




