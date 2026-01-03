const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');

//Router for approving meal eligibility list for basic ed
router.put('/basicEdApprove/:eligibilityID', adminController.approveMealEligibilityRequest);

//Router for approving scheduled meal eligibility list for higher ed
router.put('/higherEdApprove/:eligibilityID', adminController.approveScheduleMealEligibilityRequest);

router.put('/approveEvent/:eventID', adminController.approveEvents);

//routers for fetching data and analytics

router.get('/fetchClaimPerMealCount', adminController.fetchClaimPerMealCount);

//router for admin submit of eligiblity list
router.post('/generateEligibilityList', adminController.generateEligibilityList);

//router for addming meal value
router.post('/addMealValue', adminController.addMealValue);

//router for editing meal value
router.put('/editMealValue', adminController.editMealValue);

//router for chceking meal value
router.get('/checkMealCreditValue', adminController.checkMealCreditValue);

module.exports = router;