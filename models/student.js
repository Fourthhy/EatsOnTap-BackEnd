// models/Student.js
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  rfidTag: { type: String },
  studentID: { type: String, required: true, unique: true },
  first_name: { type: String, required: true },
  middle_name: { type: String, required: true },
  last_name: { type: String, required: true },
  section: { type: String }, //for basic education
  program: { type: String }, //for higher education
  year: { type: String, required: true },
  temporaryClaimStatus: { type: [String], enum: ["ELIGIBLE", "NO-SCHEDULE", "WAIVED", "CLAIMED", "NO-BALANCE", "INELIGIBLE"], default: "INELIGIBLE" },
  temporaryCreditBalance: { type: Number, default: 0 },
  academicStatus: { type: [String], enum: ["IRREGULAR", "REGULAR"], default: "REGULAR" },
  claimRecords: [{
    _id: false,
    date: { type: Date },
    creditClaimed: { type: Number },
    remarks: { type: [String], enum: ["CLAIMED", "UNCLAIMED", "WAIVED", "UNASSIGNED"] },
  }],
});

module.exports = mongoose.model('Student', studentSchema);