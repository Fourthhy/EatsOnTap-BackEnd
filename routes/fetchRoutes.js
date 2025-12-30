const express = require('express');
const router = express.Router();

const fetchController = require('../controllers/fetchController');

// === ADMIN FETCHERS === 

router.get('/getUnifiedSchoolData', fetchController.getUnifiedSchoolData);

module.exports = router;