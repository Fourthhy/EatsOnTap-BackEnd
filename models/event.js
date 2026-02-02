const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    //General Information
    eventID: { type: String, required: true },
    eventName: { type: String, required: true },
    eventScope: { type: String, required: true }, // e.g., "School-Wide" or "Departmental"

    // Schedule
    startDay: { type: Number, required: true },
    endDay: { type: Number, required: true },
    startMonth: { type: String, required: true },
    endMonth: { type: String, required: true },
    
    // User Preference
    eventColor: { type: String, default: '#dbeafe' }, 

    //Event Status
    submissionStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    scheduleStatus: { type: String, enum: ["ONGOING", "RECENT", "UPCOMING"], default: "ONGOING" },
    
    //Event Participants
    forEligibleSection: { type: [String], default: [] },
    forEligibleProgramsAndYear: [{
        program: { type: String },
        year: { type: String }
    }],

});

module.exports = mongoose.model('Event', eventSchema);