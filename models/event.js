const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    eventID: { type: String, required: true },
    eventName: { type: String, required: true },
    eventScope: { type: String, required: true }, // e.g., "School-Wide" or "Departmental"
    
    // 🟢 Date Parts (Matching your Controller logic)
    startDay: { type: Number, required: true },
    endDay: { type: Number, required: true },
    startMonth: { type: String, required: true },
    endMonth: { type: String, required: true },
    
    // 🟢 NEW: Store the selected UI color
    eventColor: { type: String, default: '#dbeafe' }, 

    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    
    forEligibleSection: { type: [String], default: [] },
    forEligibleProgramsAndYear: [{
        program: { type: String },
        year: { type: String }
    }],
    forTemporarilyWaived: { type: [String], default: [] },
    absentStudents: { type: [String], default: [] }
});

module.exports = mongoose.model('Event', eventSchema);