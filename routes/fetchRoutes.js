const express = require('express');
const router = express.Router();

const fetchController = require('../controllers/fetchController');

// === ADMIN FETCHERS === 

router.get('/getUnifiedSchoolData', fetchController.getUnifiedSchoolData);

router.get('/getAllClassAdvisers', fetchController.getAllClassAdvisers);

router.get('/getAllBasicEducationMealRequest', fetchController.getAllBasicEducationMealRequest);

router.get('/getAllHigherEducationMealRequest', fetchController.getAllHigherEducationMealRequest);

router.get('/getAllEvents', fetchController.getAllEvents);

router.get('/getTodayClaimRecord', fetchController.getTodayClaimRecord);

module.exports = router;