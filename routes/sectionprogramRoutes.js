const express = require('express');
const router = express.Router();

const sectionprogramcontroller = require('../controllers/sectionprogramController')

router.put('/addSectionProgram', sectionprogramcontroller.addSectionProgram);

module.exports = router

