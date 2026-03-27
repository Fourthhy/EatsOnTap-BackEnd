const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userID: { type: String, required: true, unique: true },
    /*
    system generated unique ID
    composition: last 2 digits of year - entry number for that year (5 digits), and first letter of first_name, middle_name, and last_name (if middle_name is not provided, double the first letter of the last_name)
    */
    first_name: { type: String },
    middle_name: { type: String },
    last_name: { type: String },
    role: { type: String, enum: ['ADMIN-ASSISTANT', 'ADMIN', 'FOOD-SERVER', 'CANTEEN-STAFF', 'SUPER-ADMIN', 'CHANCELLOR'], required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isActive: { type: Boolean, default: false },
    isRequiredChangePassword: { type: Boolean, default: false },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date }
})
//match: [/^[\w-\.]+@laverdad\.edu\.ph$/, 'Email must be a valid @laverdad.edu.ph address']
module.exports = mongoose.model('Users', userSchema);