const express = require('express');
const router = express.Router();

const fetchController = require('../controllers/fetchController');

// === ADMIN FETCHERS === 

router.get('/getUnifiedSchoolData', fetchController.getUnifiedSchoolData);

router.get('/getAllClassAdvisers', fetchController.getAllClassAdvisers);

module.exports = router;