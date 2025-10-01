// models/Student.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userID: { type: String, required: true, unique: true },
    first_name: { type: String, required: true },
    middle_name: { type: String, required: true },
    last_name: { type: String, required: true },
    role: { type: String, enum: ['classAdviser', 'adminAssistant','admin', 'foodServer', 'canteenStaff', 'superAdmin', 'chancellor']},
    email: { type: String, required: true, unique: true, match: [/.+@.+\..+/, 'Please enter a valid email address']},
    password: { type: String, required: true }
})

module.exports = mongoose.model('Users', userSchema);