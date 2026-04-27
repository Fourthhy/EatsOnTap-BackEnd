const express = require('express');
const router = express.Router();

const claimController = require('../controllers/claimController');
const userAuthentication = require('../middlewares/userAuthentication');

//New route for claiming free meal
// router.put('/claim-meal', userAuthentication.authSecurity, userAuthentication.foodServerAuth, claimController.claimMeal);
router.put('/claim-meal', claimController.claimMeal);
//New route for claiming food item
router.put('/:studentID/claim-foodItem', claimController.claimFood);
//Unprotected Routes

router.get('/getApprovedStudentsToday', claimController.getApprovedStudentsToday);

// New route for deducting credits
router.put('/:studentID/deduct-credits', claimController.deductCredits);
//new route for deducting remaining credits

router.get('/fakeMealClaim', claimController.fakeMealClaim)

router.put('/fakeFoodItemClaim', claimController.fakeFoodItemClaim);

router.post('/assignCreditsForEvents', claimController.assignCreditsForEvents)



module.exports = router;