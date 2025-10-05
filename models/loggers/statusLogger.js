const mongoose = require('mongoose');

const statusLoggerSchema = new mongoose.Schema({
    timeStamp: { type: Date, default: Date.now, required: true },
    studentID: { type: String, required: true },
    actionTaken: { type: String, required: true, enum: ['WAIVE', 'ELIGIBLE'], },
})

module.exports = mongoose.model('statusLogger', statusLoggerSchema);