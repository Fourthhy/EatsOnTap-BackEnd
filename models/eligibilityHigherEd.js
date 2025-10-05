const mongoose = require('mongoose');

const eligibilitySchema = new mongoose.Schema({
    eligibilityID: { type: String, unique: true, required: true },
    timeStamp: { type: Date, default: Date.now, required: true },
    requester: { type: String, required: true },
    section : { type: String, required: true},
    forEligible: { type: [String], required: true},
    forWaived: { type: [String], required: true }
})

module.exports = mongoose.model('eligibilityListing', eligibilitySchema);