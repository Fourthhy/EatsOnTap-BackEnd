const mongoose = require('mongoose');

const classAdviserSchema = new mongoose.Schema({
    userID: { type: String, required: true, unique: true },
    honorific: { type: String, enum: ["Mr.", "Ms."] },
    first_name: { type: String, required: true },
    middle_name: { type: String, required: true },
    last_name: { type: String, required: true },
    role: { type: String, default: 'CLASS-ADVISER'},
    section : { type: String },
    year: { type: String },
    email: { type: String, required: true, unique: true, match: [/^[\w-\.]+@laverdad\.edu\.ph$/, 'Email must be a valid @laverdad.edu.ph address']},
    password: { type: String, required: true },
    isActive: { type: Boolean, default: false },
    isRequiredChangePassword: { type: Boolean, default: false },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date }
});

module.exports = mongoose.model('classAdviser', classAdviserSchema);