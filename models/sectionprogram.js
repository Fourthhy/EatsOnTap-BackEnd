const mongoose = require('mongoose');

const sectionprogramSchema = new mongoose.Schema({
    // 🟢 ADDED "PRESCHOOL" to the enum list
    department: { 
        type: String, 
        enum: ["PRESCHOOL", "PRIMARY", "INTERMEDIATE", "JUNIOR HIGH SCHOOL", "SENIOR HIGH SCHOOL", "HIGHER EDUCATION"], 
        required: true 
    },
    year: { type: String, required: true },
    section: { type: String },
    program: { type: String },
    adviser: { type: String }, // 🟢 NOTE: This is 'adviser', not 'handleAdviser'
    studentCount: { type: Number, default: 0 }
});

module.exports = mongoose.model('SectionProgram', sectionprogramSchema);