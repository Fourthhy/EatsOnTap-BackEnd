const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');

//Router for approving meal eligibility list for basic ed
router.put('/basicEdApprove/:eligibilityID', adminController.approveMealEligibilityRequest);

//Router for approving scheduled meal eligibility list for higher ed
router.put('/higherEdApprove/:eligibilityID', adminController.approveScheduleMealEligibilityRequest);

router.put('/approveEvent/:eventID', adminController.approveEvents);

module.exports = router;