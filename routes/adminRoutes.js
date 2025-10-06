const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');

//Router for approving meal eligibility list for basic ed
router.put('/:eligibilityID/basicEdApprove', adminController.approveMealEligibilityRequest);

//Router for approving scheduled meal eligibility list for higher ed
router.put('/:eligibilityID/higherEdApprove', adminController.approveScheduleMealEligibilityRequest);

module.exports = router;