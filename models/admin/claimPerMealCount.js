const mongoose = require('mongoose');

const claimPerMealCountSchema = new mongoose.Schema({
    entryDay: { type: Number, required: true },
    entryMonth: { type: Number, required: true },
    entryYear: { type: Number, required: true },
    dish1Name: { type: String, required: true },
    dish2Name: { type: String },
    claimedCount: { type: Number, required: true },
    unclaimedCount: { type: Number, required: true },
})

module.exports = new mongoose.model('claimPerMealCount', claimPerMealCountSchema);