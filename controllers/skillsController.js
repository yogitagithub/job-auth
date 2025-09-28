const Skill = require("../models/Skills");
const JobSeekerProfile = require("../models/JobSeekerProfile");
const JobSeekerSkill = require("../models/JobSeekerSkill");
const mongoose = require("mongoose");




const tidy = (s) => (typeof s === "string" ? s.trim() : "");

exports.addMySkills = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, role } = req.user || {};
    if (role !== "job_seeker") {
      await session.abortTransaction(); session.endSession();
      return res.status(403).json({ status: false, message: "Only job seekers can add skills." });
    }

    // accept any skills (strings)
    let names = Array.isArray(req.body?.skills) ? req.body.skills : [];
    names = names.map(tidy).filter(Boolean);

    // de-dupe by lowercase
    const seen = new Set();
    names = names.filter(n => {
      const k = n.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (!names.length) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ status: false, message: "No skills provided." });
    }

    // ensure seeker profile exists
    const jsProfile = await JobSeekerProfile
      .findOne({ userId })
      .select("_id")
      .session(session);

    if (!jsProfile) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ status: false, message: "Please complete your profile before adding skills." });
    }

    // get or create the JobSeekerSkill row
    let jss = await JobSeekerSkill.findOne({ userId }).session(session);
    if (!jss) {
      const created = await JobSeekerSkill.create(
        [{ userId, jobSeekerId: jsProfile._id, skillIds: [] }],
        { session }
      );
      jss = created[0];
    }

    // helper: find existing Skill by name (case-insensitive) OR create it
    const upsertSkillByName = async (name) => {
      let skillDoc = await Skill.findOne({ skill: name })
        .collation({ locale: "en", strength: 2 }) // case-insensitive name match
        .session(session);

      if (!skillDoc) {
        const created = await Skill.create([{ skill: name }], { session });
        skillDoc = created[0];
      }
      return skillDoc;
    };

    // resolve skillIds for each provided name (creating Skill docs if needed)
    const resolvedSkillDocs = [];
    for (const name of names) {
      const doc = await upsertSkillByName(name);
      resolvedSkillDocs.push(doc);
    }

    // add only the new ones to this seeker
    const existingSet = new Set((jss.skillIds || []).map(id => String(id)));
    const toAddIds = [];
    const alreadyHad = [];
    const addedNames = [];

    for (const s of resolvedSkillDocs) {
      const idStr = String(s._id);
      if (existingSet.has(idStr)) {
        alreadyHad.push(s.skill);
      } else {
        toAddIds.push(s._id);
        addedNames.push(s.skill);
      }
    }

    if (toAddIds.length) {
      await JobSeekerSkill.updateOne(
        { _id: jss._id },
        { $addToSet: { skillIds: { $each: toAddIds } } },
        { session }
      );

      // optional: bump per-skill counters
      const incOps = toAddIds.map(_id => ({
        updateOne: { filter: { _id }, update: { $inc: { count: 1 } } }
      }));
      try { if (incOps.length) await Skill.bulkWrite(incOps, { session }); } catch (_) {}
    }

    // flip the profile flag: true if they now have any skills at all
    const finalCount = (jss.skillIds?.length || 0) + toAddIds.length;
    await JobSeekerProfile.updateOne(
      { _id: jsProfile._id, isDeleted: false },
      { $set: { isSkillsAdded: finalCount > 0 } },
      { session }
    );

    await session.commitTransaction(); session.endSession();

    return res.status(200).json({
      status: true,
      message: addedNames.length
        ? "Skills saved successfully."
        : "All provided skills already exist on your profile.",
      data: 
        addedNames
        
      
    });

  } catch (err) {
    await session.abortTransaction(); session.endSession();
    return res.status(500).json({ status: false, message: "Error adding skills", error: err.message });
  }
};



exports.getMySkills = async (req, res) => {
  try {
    const { userId, role } = req.user || {};
    if (role !== "job_seeker") {
      return res.status(403).json({ status: false, message: "Only job seekers can view their skills." });
    }

    // Find the user's skill doc
    const jss = await JobSeekerSkill.findOne({ userId })
      // populate only active admin skills, select only the name
      .populate({ path: "skillIds", match: { isDeleted: false }, select: "skill" })
      .lean();

    // No document yet → empty list
    if (!jss) {
      return res.status(200).json({
        status: true,
        message: "No skills added yet.",
        data: []
      });
    }

    // If the user's skill list is soft-deleted → block access
    if (jss.isDeleted) {
      return res.status(409).json({
        status: false,
        message: "Your skill list is currently disabled."
      });
    }

    // Build plain array of active skills
    const data = (jss.skillIds || []).map(s => s.skill);

    return res.status(200).json({
      status: true,
      message: data.length ? "Skills fetched successfully." : "No active skills found.",
      data
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: "Error fetching skills", error: err.message });
  }
};



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
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, role } = req.user || {};
    if (role !== "job_seeker") {
      await session.abortTransaction(); session.endSession();
      return res.status(403).json({ status: false, message: "Only job seekers can delete their skill list." });
    }

    // 1) Find the job seeker's document
    const jss = await JobSeekerSkill.findOne({ userId }).session(session);
    if (!jss) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ status: false, message: "Skill list not found." });
    }

    // 2) Already soft-deleted?
    if (jss.isDeleted) {
      await session.abortTransaction(); session.endSession();
      return res.status(409).json({ status: false, message: "Skill list is already soft-deleted." });
    }

    // 3) Decrement counts for every linked skill (recommended to keep totals accurate)
    const skillIds = Array.isArray(jss.skillIds) ? jss.skillIds : [];
    if (skillIds.length) {
      await Skill.updateMany(
        { _id: { $in: skillIds }, count: { $gt: 0 } },
        { $inc: { count: -1 } },
        { session }
      );
    }

    // 4) Soft delete the JobSeekerSkill doc
    await JobSeekerSkill.updateOne(
      { _id: jss._id },
      { $set: { isDeleted: true } },
      { session }
    );



     // Any other non-deleted skills doc with non-empty array?
    const hasRemaining = await JobSeekerSkill.exists({
      userId,
      isDeleted: { $ne: true },
      skillIds: { $exists: true, $ne: [] },
    }).session(session);

    await JobSeekerProfile.updateOne(
      { userId },
      { $set: { isSkillsAdded: !!hasRemaining } },
      { session }
    );

    

    await session.commitTransaction(); session.endSession();

    return res.status(200).json({
      status: true,
      message: "Your skill list has been soft-deleted.",
      data: { id: jss._id, isDeleted: true }
    });
  } catch (err) {
    await session.abortTransaction(); session.endSession();
    return res.status(500).json({ status: false, message: "Error deleting skill list", error: err.message });
  }
};


// DELETE one skill from the logged-in job seeker's skills
const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


exports.removeSingleSkillByName = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, role } = req.user || {};
    const rawName = decodeURIComponent(req.params.skillName || "").trim();

    if (role !== "job_seeker") {
      await session.abortTransaction(); session.endSession();
      return res.status(403).json({ status: false, message: "Only job seekers can modify their skills." });
    }
    if (!rawName) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ status: false, message: "skillName is required in the URL." });
    }

    // 1) Load the user's active skills doc
    const jss = await JobSeekerSkill.findOne({ userId, isDeleted: { $ne: true } })
      .select("_id jobSeekerId skillIds")
      .lean()
      .session(session);

    if (!jss) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ status: false, message: "Skill list not found." });
    }

    // 2) Find the *owned* skill by name (case-insensitive), using the `skill` field
    //    Also fallback to `name` if your schema ever had that.
    const rx = new RegExp(`^${escapeRegex(rawName)}$`, "i");
    const skill = await Skill.findOne({
      _id: { $in: jss.skillIds },
      isDeleted: { $ne: true },
      $or: [{ skill: rx }, { name: rx }],  // supports either field
    })
      .select("_id skill name")
      .session(session);

    if (!skill) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({
        status: false,
        message: `Skill '${rawName}' is not present in your list.`,
      });
    }

    // 3) Pull it from the array
    const updated = await JobSeekerSkill.findOneAndUpdate(
      { _id: jss._id },
      { $pull: { skillIds: skill._id } },
      { new: true, session }
    );

    // 4) Optional: decrement global counter if you track it
    await Skill.updateOne(
      { _id: skill._id, count: { $gt: 0 } },
      { $inc: { count: -1 } },
      { session }
    );

    // 5) If no skills left, flip profile flag
    if (!updated.skillIds.length) {
      await JobSeekerProfile.updateOne(
        { _id: jss.jobSeekerId },
        { $set: { isSkillsAdded: false } },
        { session }
      );
    }

    await session.commitTransaction(); session.endSession();

    return res.status(200).json({
      status: true,
      message: "Skill removed successfully.",
      data: {
        removedSkillId: String(skill._id),
        removedSkillName: skill.skill || skill.name,
        
      },
    });
  } catch (err) {
    await session.abortTransaction(); session.endSession();
    return res.status(500).json({ status: false, message: "Error removing skill", error: err.message });
  }
};


