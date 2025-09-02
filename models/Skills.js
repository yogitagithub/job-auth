const mongoose = require("mongoose");

function tidySkill(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

const skillSchema = new mongoose.Schema(
  {
    skill: {
      type: String,
      required: true,
      trim: true
    },
    count: {
      type: Number,
      default: 0,
      min: 0
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  { timestamps: true }
);

// collapse extra spaces before validation
skillSchema.pre("validate", function(next) {
  if (this.skill) this.skill = tidySkill(this.skill);
  next();
});

// Case-insensitive UNIQUE index on active docs only
// (strength:2 => case-insensitive; diacritics-insensitive)
skillSchema.index(
  { skill: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 },
    partialFilterExpression: { isDeleted: false }
  }
);

module.exports = mongoose.model("Skill", skillSchema);
