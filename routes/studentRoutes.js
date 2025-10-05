// routes/studentRoutes.js
const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
// import upload  from '../middlewares/multer.js'
const upload = require('../middlewares/multer.js').default;

//Route for adding a new student
router.post('/', studentController.createStudent);

//Route for fetching all students
router.get('/', studentController.getAllStudents);

//Route for fetching student with specified ID
router.get('/:studentID', studentController.getStudentById);

//Route for adding students using csv
router.post('/usingCSV', upload.single('students_information'), studentController.creteStudentFromCSV);
// router.post('/usingCSV', studentController.creteStudentFromCSV);

//Route for deem student Waived
router.put('/:studentID/waiveStatus', studentController.waiveStudent);

//Route for deem student Eligible 
router.put('/:studentID/eligibleStatus', studentController.eligibleStudent);

module.exports = router;