const mongoose = require('mongoose');

const sectionprogramSchema = new mongoose.Schema({
    department: {type: String, required: true},
    year: {type: String, required: true},
    section: {type: String },
    program: {type: String},
    handleAdviser: {type: String},
    studentCount: {type: Number}
})

module.exports = mongoose.model('SectionProgram', sectionprogramSchema);