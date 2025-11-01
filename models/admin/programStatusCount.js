const mongoose = require('mongoose');

const programStatusCountSchema = new mongoose.Schema({
    entryDay: { type: Number, required: true },
    entryMonth: { type: Number, required: true },
    entryYear: { type: Number, required: true },
    cohort: { type: String, required: true, enum: ["Preschool", "Primary Education", "Intermediate", "Junior High School", "Senior High School", "Higher Education"] },
    claimedCount: { type: Number, required: true },
    unclaimedCount: { type: Number, required: true },
    waivedCount: { type: Number, required: true },
})

module.exports = new mongoose.model('programStatusCount', programStatusCountSchema);