const express = require('express');
const router = express.Router();

const eligibilityController = require('../controllers/eligibilityController');

//Route for submitting meal request list for basic ed
router.post('/submitListforBasicEduc', eligibilityController.submitDailyMealRequestList);

//Route for submitting scheduled meal request list for higher ed
router.post('/submitListforHigherEduc', eligibilityController.submitScheduledMealRequestList);

//Route for fetching meal request list by section
router.get('/fetchRequestsBySection/:section', eligibilityController.fetchDailyRequestsBySection);

module.exports = router;