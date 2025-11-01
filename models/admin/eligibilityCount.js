const mongoose = require('mongoose');

const eligibilityCountSchema = new mongoose.Schema({
    entryDay: { type: Number, required: true },
    entryMonth: { type: Number, required: true },
    entryYear: { type: Number, required: true },
    totalEligibleCount: { type: Number, required: true }, //all from forEligible in the submitted meal requests
    totalIneligibleCount: { type: Number, required: true }, //all from the program and year, and sections that do not have classes
    totalClaimedCount: { type: Number, required: true }, //all from students that already claimed
    claimedDifferenceCount: { type: Number, required: true }, //from claimToday - claimYesterday
    claimedDifferenceLabel: { type: String, required: true, enum: ["INCREASE", "DECREASE"] }, //the difference of claims from yesterday, wether increase or decrease 
    totalVirtualCreditUsed: { type: Number, required: true }, //totalClaimedCount * virtual credit allowance
    totalWaived: { type: Number, required: true }, //all from forWavied in the submitted meal request     
    waivedDifferenceCount : { type: Number, required: true }, //from waivedToday - waivedYesterday
    waivedDIfferenceLabel: { type: String, required: true, enum: ["INCREASE", "DECREASE"] } //the difference of waived from yesterday, wether increase or decrease
})

module.exports = mongoose.model('eligibilityCount', eligibilityCountSchema);