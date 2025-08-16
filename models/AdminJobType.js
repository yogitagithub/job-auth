const mongoose = require("mongoose");

const jobTypeSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true, 
        unique: true,
        trim: true
    },

    isDeleted: {
        type: Boolean,
        default: false
    }

},
    { timestamps: true });

module.exports = mongoose.model("JobType", jobTypeSchema);
