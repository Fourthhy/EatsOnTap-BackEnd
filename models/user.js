const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userID: { type: String, required: true, unique: true },
    first_name: { type: String },
    middle_name: { type: String },
    last_name: { type: String },
    role: { type: String, enum: ['CLASS-ADVISER', 'ADMIN-ASSISTANT','ADMIN', 'FOOD-SERVER', 'CANTEEN-STAFF', 'SUPER-ADMIN', 'CHANCELLOR'], required: true},
    email: { type: String, required: true, unique: true, match: [/^[\w-\.]+@laverdad\.edu\.ph$/, 'Email must be a valid @laverdad.edu.ph address']},
    password: { type: String, required: true }
})

module.exports = mongoose.model('Users', userSchema);