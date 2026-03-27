const mongoose = require('mongoose');

const sectionprogramSchema = new mongoose.Schema({
    department: { type: String, enum: ["PRIMARY", "INTERMEDIATE", "JUNIOR HIGH SCHOOL", "SENIOR HIGH SCHOOL", "HIGHER EDUCATION"], required: true },
    year: { type: String, required: true },
    //"pre-k" (pre-kinder), "k" (kinder), 1-12, 1-2, 1-4
    section: { type: String },
    //section under the Basic Education Department.
    program: { type: String },
    //programs under the Higher Education Department.
    adviser: { type: String },
    //the teacher assigned to the section or program. filled by its userID
    studentCount: { type: Number, default: 0 }
    //how many students in the section or program.
})

module.exports = mongoose.model('SectionProgram', sectionprogramSchema);