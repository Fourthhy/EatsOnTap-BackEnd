const mongoose = require('mongoose');

const loggerSchema = new mongoose.Schema({
    timeStamp: { type: Date, default: Date.now, required: true },
    studentID: { type: String, required: true },
    action: { type: String, required: true, enum: ['CLAIM-FREE-MEAL', 'CLAIM-FOOD-ITEM', 'CLAIM-ATTEMPT-WAIVED', 'CLAIM-ATTEMPT-CLAIMED', 'CLAIM-ATTEMPT-INELIGIBLE', 'CLAIM-ATTEMPT-INSUFFICIENT-BALANCE', 'CLAIM-ATTEMPT-NO-BALANCE', 'REMOVED-UNUSED-BALANCE', 'ASSIGN-CREDIT'], },
    creditTaken: { type: Number, required: true }
})

module.exports = mongoose.model('Logger', loggerSchema);