const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    eventID: { type: String, required: true },
    eventName: { type: String, required: true },
    startDay: { type: String, required: true },
    endDay: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    forEligibleSection: [String],
    forEligibleProgramsAndYear: [{
        program: { type: String, required: true },
        year: { type: String, required: true }
    }],
    forTemporarilyWaived: { type: [String], required: true },
});

module.exports = mongoose.model('Event', eventSchema);
