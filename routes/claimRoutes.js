const express = require('express');
const router = express.Router();

const claimController = require('../controllers/claimController');
const userAuthentication = require('../middlewares/userAuthentication');

//New route for claiming free meal
router.put('/:studentID/claim-meal', userAuthentication.authSecurity, userAuthentication.foodServerAuth, claimController.claimMeal);
//New route for claiming food item
router.put('/:studentID/claim-foodItem', userAuthentication.authSecurity, userAuthentication.canteenStaffAuth, claimController.claimFood);
// New route for deducting credits

//Unprotected Routes
router.put('/:studentID/deduct-credits', claimController.deductCredits);
//new route for assigning credits
router.put('/:studentID/assign-credit', claimController.assignCreditValue);

module.exports = router;