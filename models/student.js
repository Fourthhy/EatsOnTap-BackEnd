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
  claimRecords: [{
    date: { type: Date },
    creditClaimed: { type: Number },
    remarks: { type: [String], enum: ["CLAIMED", "UNCLAIMED", "WAIVED"] },
  }],
  rfidTag: { type: String, default: null },
});

module.exports = mongoose.model('Student', studentSchema);