// models/Student.js
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  rfidTag: { type: String },
  //the property required for students to use their ID to claim snacks/meals.
  studentID: { type: String, required: true, unique: true },
  //the official student ID number. MUST BE CONSISTENT
  first_name: { type: String, required: true },
  middle_name: { type: String, required: true },
  last_name: { type: String, required: true },
  section: { type: String }, //for basic education
  program: { type: String }, //for higher education
  year: { type: String, required: true },
  academicStatus: { type: String, enum: ["IRREGULAR", "REGULAR"], default: "REGULAR" },

  temporaryClaimStatus: {
    type: String, // 🟢 CHANGE THIS from [String] to String
    enum: ["ELIGIBLE", "NO-SCHEDULE", "WAIVED", "CLAIMED", "NO-BALANCE", "INELIGIBLE", "ABSENT"],
    default: "INELIGIBLE"
  },
  //ELGIBILE - student is eligible to claim a meal/snack for the day, but has not claimed yet
  //NO-SCHEDULE - student has no schedule for the day, thus cannot claim a meal/snack for the day
  //WAIVED - student has been waived for the day, thus cannot claim a meal/snack for the day
  //CLAIMED - student has claimed a meal/snack for the day
  //NO-BALANCE - student has no balance left, thus cannot claim a meal/snack for the day
  //INELIGIBLE - student is ineligible to claim a meal/snack for the day, due to various reasons such as being absent, having an unassigned schedule, etc.
  //ABSENT - student is absent for the day, thus cannot claim a meal/snack for the day  
  temporaryCreditBalance: { type: Number, default: 0 },
  //the balance that is being checked when a student tries to claim a meal/snack.
  
  claimRecords: [{
    _id: false,
    date: { type: Date },
    creditClaimed: { type: Number },
    remarks: { type: [String], enum: ["CLAIMED", "UNCLAIMED", "WAIVED", "UNASSIGNED"] },
  }],
});

module.exports = mongoose.model('Student', studentSchema);