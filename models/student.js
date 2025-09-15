// models/Student.js
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentID: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  course: { type: String, required: true },
  mealEligibilityStatus: { type: String, default: 'Eligible' },
  creditValue: { type: Number, default: 60 } // Added creditValue with a default of 60
});

module.exports = mongoose.model('Student', studentSchema);