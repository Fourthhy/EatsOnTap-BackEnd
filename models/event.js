const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    eventID: { type: String, required: true },
    eventName: { type: String, required: true },
    eventSpan: { type: [String], required: true},
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    forEligibleSection: { type: [String], default: [] },
    forEligibleProgramsAndYear: [{
        program: { type: String },
        year: { type: String }
    }],
    forTemporarilyWaived: { type: [String] },
    absentStudents: { type: [String], default: [] }
});

module.exports = mongoose.model('Event', eventSchema);