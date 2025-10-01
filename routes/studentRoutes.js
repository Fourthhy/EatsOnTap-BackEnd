// routes/studentRoutes.js
const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');

//Route for adding a new student
router.post('/', studentController.createStudent);

//Route for fetching all students
router.get('/', studentController.getAllStudents);

//Route for fetching student with specified ID
router.get('/:studentID', studentController.getStudentById);

module.exports = router;