// models/Student.js
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentID: { type: String, required: true, unique: true },
  first_name: { type: String, required: true },
  middle_name: { type: String, required: true },
  last_name: { type: String, required: true },
  section: { type: String }, //for basic education
  program: { type: String }, //for higher education
  year: { type: Number, required: true },
  mealEligibilityStatus: { type: String, default: 'Ineligible' },
  creditValue: { type: Number, default: 0 }
});

module.exports = mongoose.model('Student', studentSchema);