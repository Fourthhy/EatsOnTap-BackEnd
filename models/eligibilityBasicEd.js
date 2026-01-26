const mongoose = require('mongoose');

const eligibilityBasicEdSchema = new mongoose.Schema({
    eligibilityID: { type: String, required: true },
    requester: { type: String, required: true },
    timeStamp: { type: Date, default: Date.now, required: true },
    section : { type: String, required: true},
    forEligible: { type: [String], required: true},
    forTemporarilyWaived: { type: [String], }, //waived just for the current day
    forAbsentStudents: { type: [String] },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING'},
    creditAssigned: { type: Boolean, required: true, default: false } 
});

module.exports = mongoose.model('eligibilityBasicEd', eligibilityBasicEdSchema);