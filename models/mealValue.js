const mongoose = require('mongoose');

const mealValueSchema = new mongoose.Schema({
    mealValue: { type: Number, required: true }
});

module.exports = new mongoose.model("mealValue", mealValueSchema);