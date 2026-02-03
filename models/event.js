const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    // General Information
    eventID: { type: String, required: true },
    eventName: { type: String, required: true },
    eventScope: { type: String, required: true }, 

    // Schedule
    startDay: { type: Number, required: true },
    endDay: { type: Number, required: true },
    startMonth: { type: String, required: true },
    endMonth: { type: String, required: true },
    
    // User Preference
    eventColor: { type: String, default: '#dbeafe' }, 

    // Event Status
    submissionStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN'], default: 'PENDING' },
    scheduleStatus: { type: String, enum: ["ONGOING", "RECENT", "UPCOMING"], default: "ONGOING" },
    
    // Event Participants
    // 🟢 UPDATED: Changed to Array of Objects to allow multiple sections
    forEligibleSection: [{
        section: { type: String },
        year: { type: String },
        totalEligibleCount: { type: Number, default: 0 },
        totalClaimedCount: { type: Number, default: 0 } // Fixed Typo
    }],
    
    forEligibleProgramsAndYear: [{
        program: { type: String },
        year: { type: String },
        totalEligibleCount: { type: Number, default: 0 },
        totalClaimedCount: { type: Number, default: 0 } // Fixed Typo
    }],

});

module.exports = mongoose.model('Event', eventSchema);