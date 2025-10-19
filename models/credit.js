const mongoose = require('mongoose');

const creditSchema = new mongoose.Schema({
    creditValue: { type: Number, required: true, default: 60 }
})

module.exports = mongoose.model('Credit', creditSchema);