const mongoose = require('mongoose');

const eligibiltiyLoggerSchema = new mongoose.Schema({
    timeStamp: { type: Date, default: Date.now, required: true },
    userID: { type: String, required: true },
    action: { type: String, required: true, default: 'ELIGIBILITY-REQUEST'},
    status: { type: String, required: true, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING'},
    forEligible: { type: Number, required: true },
    forWaived: { type: Number, required: false }
})

module.exports = mongoose.model('eligibiltiyLogger', eligibiltiyLoggerSchema);