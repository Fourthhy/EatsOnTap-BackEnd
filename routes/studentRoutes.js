// IMPORTS
const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const userAuthentication = require('../middlewares/userAuthentication');

// import upload  from '../middlewares/multer.js'
const upload = require('../middlewares/multer.js').default;

//Route for adding a new student
router.post('/addNewStudent', studentController.createStudent);

//Route for fetching all students
router.get('/getAllStudents', studentController.getAllStudents);

//Route for fetching student with specified ID
router.get('/:studentID', studentController.getStudentById);

/* ==== ADMIN CONTROLS ==== */

//Route for adding students using csv
router.post('/usingCSV', upload.single('students_information'), studentController.creteStudentFromCSV);

//Route for deem student Waived
router.put('/waiveStatus/:studentID', studentController.waiveStudent);

//Route for deem student Eligible 
router.put('/:studentID/eligibleStatus', studentController.eligibleStudent);

//Route for Student ID - RFID Linking
router.put('/rfidLink/:studentID', studentController.studentRFIDLinking);

//Route for fetch students using course for class adivser eligiblity
router.get('/getSection/:sectionName', userAuthentication.authSecurity, userAuthentication.checkRole('CLASS-ADVISER'), studentController.getStudentBySection);


module.exports = router;