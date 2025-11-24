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
  mealEligibilityStatus: { type: String, enum: ['ELIGIBLE', 'INELIGIBLE', 'CLAIMED', 'WAIVED'], default: 'INELIGIBLE' },
  creditValue: { type: Number, default: 0 }
});

module.exports = mongoose.model('Student', studentSchema);