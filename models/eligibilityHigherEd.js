const mongoose = require('mongoose');

const eligibilityHigherEdSchema = new mongoose.Schema({
    timeStamp: { type: Date, default: Date.now, required: true },
    requester: { type: String, required: true },
    program : { type: String, required: true},
    year: { type: Number, required: true },
    forEligible: { type: [String], required: true},
    forWaived: { type: [String], required: true },
    forDay: { type: String, enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'], required: true},
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: "PENDING"}
});

module.exports = mongoose.model('eligibilityHigherEd', eligibilityHigherEdSchema);