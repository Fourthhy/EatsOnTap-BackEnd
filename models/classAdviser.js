const mongoose = require('mongoose');

const classAdviserSchema = new mongoose.Schema({
    userID: { type: String, required: true, unique: true },
    honorific: { type: String, enum: ["Mr.", "Ms."], required: true,  },
    first_name: { type: String },
    middle_name: { type: String },
    last_name: { type: String },
    role: { type: String, default: 'ADMIN-ASSISTANT'},
    section : { type: String, required: true },
    email: { type: String, required: true, unique: true, match: [/^[\w-\.]+@laverdad\.edu\.ph$/, 'Email must be a valid @laverdad.edu.ph address']},
    password: { type: String, required: true }
})

module.exports = mongoose.model('classAdviser', classAdviserSchema);