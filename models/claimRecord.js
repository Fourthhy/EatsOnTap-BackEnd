const mongoose = require('mongoose');

const claimRecordSchema = new mongoose.Schema({
    claimDate: { type: Date, default: Date.now },
    claimRecords: [{
        _id: false,
        section: { type: String, required: true },
        eligibleStudents: [{
            _id: false,
            studentID: { type: String, required: true },
            claimType: { type: String, required: true, default: "UNCLAIMED" }, // e.g., MEAL CLAIM, FOOD ITEM CLAIM, WAIVED
            creditBalance: { type: Number, required: true },
            onHandCash: { type: Number, required: true } // 0 is a valid number!
        }],
        waivedStudents: [{
            _id: false,
            studentID: { type: String, required: true }
        }]
    }]
});

// Create the model using the schema
module.exports = mongoose.model('ClaimRecord', claimRecordSchema);