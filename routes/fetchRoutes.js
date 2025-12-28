const express = require('express');
const router = express.Router();

const fetchController = require('../controllers/fetchController');

// === DEV FETCHERS ===

router.get('/checkMismatch', fetchController.debugSectionMismatch);

// === ADMIN FETCHERS === 

router.get('/getAllClassAdvisers', fetchController.getAllClassAdvisers);

router.get('/getProgramsAndSections', fetchController.getProgramsAndSections);

module.exports = router;