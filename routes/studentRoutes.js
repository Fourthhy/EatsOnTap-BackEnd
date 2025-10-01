// routes/studentRoutes.js
const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');

//default API endpoint: http://localhost:3000/api/[endroutes]

// Define API routes and link them to controller functions
router.post('/students', studentController.createStudent);
router.get('/students', studentController.getAllStudents);
router.get('/students/:studentID', studentController.getStudentById);
//New route for claiming free meal
router.put('/students/:studentID/claim-meal', studentController.claimMeal);
//New route for claiming food item
router.put('/students/:studentID/claim-foodItem', studentController.claimFood);
// New route for deducting credits
router.put('/students/:studentID/deduct-credits', studentController.deductCredits);
//new route for assigning credits
router.put('/students/:studentID/assign-credit', studentController.assignCreditValue);

//Displaying all logging claima attempt
router.get('/logger', studentController.getAllLoggingClaimAttempts);

//New route for creating users
router.post('/user/create-user', studentController.createUser);

module.exports = router;