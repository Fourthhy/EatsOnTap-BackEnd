const mongoose = require('mongoose');

const programScheduleSchema = new mongoose.Schema({
    // Changed to match the Student schema exactly
    program: { 
        type: String, 
        required: true,
        trim: true 
    },
    year: { 
        type: String, 
        required: true,
        trim: true
    },
    dayOfWeek: [{ 
        type: String, 
        enum: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"],
        default: []
    }],
    isActive: { 
        type: Boolean, 
        default: true 
    }
}, { timestamps: true });

// The index now accurately points to the correct field names
programScheduleSchema.index({ program: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('ProgramSchedule', programScheduleSchema);