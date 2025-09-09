// models/Student.js
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentID: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  course: { type: String, required: true },
  mealEligibilityStatus: { type: String, default: 'Eligible' },
});

module.exports = mongoose.model('Student', studentSchema);