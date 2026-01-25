const mongoose = require('mongoose');

const programScheduleSchema = new mongoose.Schema({
    programName: { type: String, required: true },
    year: { type: String, required: true },
    dayOfWeek: { type: [String], enum: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"], required: true },

    //removed validity checker for ease overwrite of schedule each semester
}, { timestamps: true });
programScheduleSchema.index({ program: 1, year: 1 }, { unique: true });
module.exports = mongoose.model('ProgramSchedule', programScheduleSchema);