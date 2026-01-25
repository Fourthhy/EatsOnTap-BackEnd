const express = require('express');
const router = express.Router();

const eligibilityController = require('../controllers/eligibilityController');
const userAuthentication = require('../middlewares/userAuthentication');

/* ==== CLASS ADVISER ==== */
//Route for submitting meal request list for basic ed
router.post('/submitListforBasicEduc', eligibilityController.submitDailyMealRequestList);

//Route for fetching meal request list by section
router.get('/fetchRequestsBySection/:section', eligibilityController.fetchDailyRequestsBySection);

/* ==== ADMIN ASSISTANT ==== */
//Route for submitting scheduled meal request list for higher ed
router.post('/submitListforHigherEduc', userAuthentication.authSecurity, userAuthentication.adminAssistantAuth, eligibilityController.submitScheduledMealRequestList);

router.put('/claimStatusReset', eligibilityController.claimStatusReset);

module.exports = router;