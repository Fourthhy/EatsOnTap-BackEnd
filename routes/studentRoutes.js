// routes/studentRoutes.js
const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');

// Define API routes and link them to controller functions
router.post('/students', studentController.createStudent);
router.get('/students', studentController.getAllStudents);
router.get('/students/:studentID', studentController.getStudentById);
router.put('/students/:studentID/claim-meal', studentController.claimMeal);
// New route for deducting credits
router.put('/students/:studentID/deduct-credits', studentController.deductCredits);
//new route for assigning credits
router.put('/students/:studentID/assign-credit', studentController.assignCreditValue);

module.exports = router;