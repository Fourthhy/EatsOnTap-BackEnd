const express = require('express');
const router = express.Router();

const claimController = require('../controllers/claimController');
const userAuthentication = require('../middlewares/userAuthentication');

//New route for claiming free meal
router.put('/:studentID/claim-meal', userAuthentication.authSecurity, userAuthentication.foodServerAuth, claimController.claimMeal);
//New route for claiming food item
router.put('/:studentID/claim-foodItem', userAuthentication.authSecurity, userAuthentication.canteenStaffAuth, claimController.claimFood);
//Unprotected Routes

// New route for deducting credits
router.put('/:studentID/deduct-credits', claimController.deductCredits);
//new route for assigning credits
router.put('/assign-credit', claimController.assignCredits);
//new route for deducting remaining credits
router.put('/:studentID/remove-credits', claimController.removeCredits);

module.exports = router;