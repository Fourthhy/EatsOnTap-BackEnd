const mongoose = require('mongoose');

const eligibilityBasicEdSchema = new mongoose.Schema({
    timeStamp: { type: Date, default: Date.now, required: true },
    requester: { type: String, required: true },
    section : { type: String, required: true},
    forEligible: { type: [String], required: true},
    forTemporarilyWaived: { type: [String], required: true } //waived just for the current day
});

module.exports = mongoose.model('eligibilityBasicEd', eligibilityBasicEdSchema);