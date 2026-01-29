const express = require('express');
const router = express.Router();

const sectionprogramcontroller = require('../controllers/sectionprogramController')

router.post('/addSectionProgram', sectionprogramcontroller.addSectionProgram);

router.get('/fetchAllSectionProgram', sectionprogramcontroller.fetchAllSectionProgram);

router.post('/generateSectionPrograms', sectionprogramcontroller.generateSectionPrograms);

module.exports = router

