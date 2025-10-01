
const JobSeekerProfile = require("../models/JobSeekerProfile");
const JobSeekerSkill = require("../models/JobSeekerSkill");
const mongoose = require("mongoose");




 const tidy = (s) => (typeof s === "string" ? s.trim() : "");


 

exports.addMySkills = async (req, res) => {
  try {
    const { userId, role } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can add skills."
      });
    }

    // Accept array or single string
    let incoming = req.body?.skills;
    if (typeof incoming === "string") incoming = [incoming];
    if (!Array.isArray(incoming)) incoming = [];

    // Normalize: trim & drop empties
    const cleaned = incoming
      .map((s) => String(s).trim())
      .filter(Boolean);

    if (cleaned.length === 0) {
      return res.status(400).json({
        status: false,
        message: "No skills provided."
      });
    }

    // Fetch existing skills once to compute what is actually NEW
    const existingDoc = await JobSeekerSkill
      .findOne({ userId, isDeleted: false })
      .select("skills")
      .lean();

    const existingSet = new Set(existingDoc?.skills || []);
    const uniqueNew = [];
    for (const s of cleaned) {
      // exact-match dedupe against what's already stored and within this request
      if (!existingSet.has(s)) {
        uniqueNew.push(s);
        existingSet.add(s);
      }
    }

    // Upsert the user's skills doc; add only the unique new ones
    if (uniqueNew.length) {
      await JobSeekerSkill.findOneAndUpdate(
        { userId, isDeleted: false },
        {
          $setOnInsert: { userId },
          $addToSet: { skills: { $each: uniqueNew } },
        },
        { upsert: true, new: true }
      );

      // Optional: mark progress flag on profile
      await JobSeekerProfile.updateOne(
        { userId, isDeleted: false },
        { $set: { isSkillsAdded: true } }
      );

      return res.status(200).json({
        status: true,
        message: "Skills added successfully.",
        data: uniqueNew
      });
    }

    // Nothing new to add
    return res.status(200).json({
      status: true,
      message: "All provided skills already exist on your profile.",
      data: []
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Error adding skills.",
      error: err.message
    });
  }
};




exports.getMySkills = async (req, res) => {
  try {
    const { userId, role } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can view their skills."
      });
    }

    // Fetch this user's (non-deleted) skills doc
    const doc = await JobSeekerSkill
      .findOne({ userId, isDeleted: false })
      .select("skills")
      .lean();

    if (!doc) {
      return res.status(200).json({
        status: true,
        message: "No skills added yet.",
        data: []
      });
    }

    const skills = Array.isArray(doc.skills) ? doc.skills : [];

    return res.status(200).json({
      status: true,
      message: "Skills fetched successfully.",
      data: skills
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Error fetching skills.",
      error: err.message
    });
  }
};

// checking needed
exports.updateSkill = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, role } = req.user || {};
    if (role !== "job_seeker") {
      await session.abortTransaction(); session.endSession();
      return res.status(403).json({ status: false, message: "Only job seekers can update skills." });
    }

    let { oldSkill, newSkill } = req.body || {};
    oldSkill = tidy(oldSkill || "");
    newSkill = tidy(newSkill || "");

    if (!oldSkill || !newSkill) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ status: false, message: "oldSkill and newSkill are required." });
    }
    if (oldSkill.toLowerCase() === newSkill.toLowerCase()) {
      await session.abortTransaction(); session.endSession();
      return res.status(200).json({ status: true, message: "No changes detected.", data: [] });
    }

    // Ensure job seeker profile exists (optional guard)
    const jsProfile = await JobSeekerProfile.findOne({ userId }).select("_id").session(session);
    if (!jsProfile) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ status: false, message: "Please complete your profile before updating skills." });
    }

    // Load the user's skill list
    let jss = await JobSeekerSkill.findOne({ userId }).session(session);
    if (!jss) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ status: false, message: "No skill list found for this user." });
    }
    if (jss.isDeleted) {
      await session.abortTransaction(); session.endSession();
      return res.status(409).json({ status: false, message: "Your skill list is currently disabled." });
    }

    // Resolve both skills against Admin skills (must be active)
    const found = await Skill.find({
      isDeleted: false,
      skill: { $in: [oldSkill, newSkill] }
    })
      .collation({ locale: "en", strength: 2 }) // case-insensitive
      .session(session);

    const byNorm = new Map(found.map(s => [tidy(s.skill).toLowerCase(), s]));
    const docOld = byNorm.get(oldSkill.toLowerCase());
    const docNew = byNorm.get(newSkill.toLowerCase());

    if (!docOld) {
      await session.abortTransaction(); session.endSession();
      return res.status(422).json({ status: false, message: "oldSkill is not in admin skill list." });
    }
    if (!docNew) {
      await session.abortTransaction(); session.endSession();
      return res.status(422).json({ status: false, message: "newSkill is not in admin skill list." });
    }

    // Ensure oldSkill is in the user's list
    const hasOld = (jss.skillIds || []).some(id => String(id) === String(docOld._id));
    if (!hasOld) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({
        status: false,
        message: "You can only update a skill that already exists in your list."
      });
    }

    // Prevent duplicates: newSkill must not already be in user's list
    const hasNew = (jss.skillIds || []).some(id => String(id) === String(docNew._id));
    if (hasNew) {
      await session.abortTransaction(); session.endSession();
      return res.status(409).json({ status: false, message: "The new skill already exists in your list." });
    }

    // Swap: pull old, push new
    await JobSeekerSkill.updateOne(
      { _id: jss._id },
      { $pull: { skillIds: docOld._id } },
      { session }
    );
    await JobSeekerSkill.updateOne(
      { _id: jss._id },
      { $addToSet: { skillIds: docNew._id } },
      { session }
    );

    // Adjust counts (+1 for new, -1 for old; guard against negative)
    await Skill.bulkWrite(
      [
        { updateOne: { filter: { _id: docOld._id, count: { $gt: 0 } }, update: { $inc: { count: -1 } } } },
        { updateOne: { filter: { _id: docNew._id },                       update: { $inc: { count: 1 } } } }
      ],
      { session }
    );

    // Return the updated list as plain array
    const refreshed = await JobSeekerSkill.findById(jss._id)
      .populate({ path: "skillIds", match: { isDeleted: false }, select: "skill" })
      .session(session);

    await session.commitTransaction(); session.endSession();

    return res.status(200).json({
      status: true,
      message: "Skill updated successfully.",
      data: (refreshed?.skillIds || []).map(s => s.skill)
    });

  } catch (err) {
    await session.abortTransaction(); session.endSession();
    return res.status(500).json({ status: false, message: "Error updating skill", error: err.message });
  }
};




exports.deleteSkill = async (req, res) => {
  try {
    const { userId, role } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can delete their skill list."
      });
    }

    // Find this user's skills document
    const doc = await JobSeekerSkill.findOne({ userId });
    if (!doc) {
      return res.status(404).json({
        status: false,
        message: "Skill list not found."
      });
    }

    // Already soft-deleted?
    if (doc.isDeleted) {
      return res.status(409).json({
        status: false,
        message: "Skill list is already soft-deleted."
      });
    }

    // Soft delete the skills doc
    await JobSeekerSkill.updateOne(
      { _id: doc._id },
      { $set: { isDeleted: true } }
    );

    // Flip profile flag (no active skills after soft delete)
    await JobSeekerProfile.updateOne(
      { userId, isDeleted: false },
      { $set: { isSkillsAdded: false } }
    );

    return res.status(200).json({
      status: true,
      message: "Skill list is already soft-deleted.",
      
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Error deleting skill list",
      error: err.message
    });
  }
};






const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// DELETE one skill from the logged-in job seeker's skills
exports.removeSingleSkillByName = async (req, res) => {
  try {
    const { userId, role } = req.user || {};
    const rawName = decodeURIComponent(req.params.skillName || "").trim();

    if (role !== "job_seeker") {
      return res.status(403).json({
        status: false,
        message: "Only job seekers can modify their skills."
      });
    }

    if (!rawName) {
      return res.status(400).json({
        status: false,
        message: "skillName is required in the URL."
      });
    }

    // Load active skills doc for this user
    const doc = await JobSeekerSkill
      .findOne({ userId, isDeleted: false })
      .select("skills")
      .lean();

    if (!doc) {
      return res.status(404).json({
        status: false,
        message: "Skill list not found."
      });
    }

    const skills = Array.isArray(doc.skills) ? doc.skills : [];

    // Find exact stored value (case-insensitive compare)
    const idx = skills.findIndex(s => String(s).toLowerCase() === rawName.toLowerCase());
    if (idx === -1) {
      return res.status(404).json({
        status: false,
        message: `Skill '${rawName}' is not present in your list.`
      });
    }

    const matched = skills[idx]; // canonical stored string

    // Pull that single skill and get the updated list
    const updated = await JobSeekerSkill.findOneAndUpdate(
      { userId, isDeleted: false },
      { $pull: { skills: matched } },
      { new: true, select: "skills" }
    );

    // If now empty, flip the profile flag
    if (!updated.skills.length) {
      await JobSeekerProfile.updateOne(
        { userId, isDeleted: false },
        { $set: { isSkillsAdded: false } }
      );
    }

    return res.status(200).json({
      status: true,
      message: "Skill removed successfully.",
      data: {
        removedSkillName: matched,
        skills: updated.skills
      }
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Error removing skill",
      error: err.message
    });
  }
};
