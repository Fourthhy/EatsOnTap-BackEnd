const express = require('express');
const router = express.Router();

const claimController = require('../controllers/claimController');

//New route for claiming free meal
router.put('/:studentID/claim-meal', claimController.claimMeal);
//New route for claiming food item
router.put('/:studentID/claim-foodItem', claimController.claimFood);
// New route for deducting credits
router.put('/:studentID/deduct-credits', claimController.deductCredits);
//new route for assigning credits
router.put('/:studentID/assign-credit', claimController.assignCreditValue);

module.exports = router;