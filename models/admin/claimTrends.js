const mongoose = require('mongoose');

const claimTrendsSchema = new mongoose.Schema({
    entryDay: { type: Number, required: true },
    entryMonth: { type: Number, required: true },
    entryYear: { type: Number, required: true },
    prePackedClaims: { type: Number, required: true },
    foodItemClaims: { type: Number, required: true },
    unusedVouchers: { type: Number, required: true }, //basically the unclaimed ones
})

module.exports = new mongoose.model('claimTrends', claimTrendsSchema);