const express = require('express');
const router = express.Router();

const classAdviserController = require('../controllers/classAdviserController');

const upload = require('../middlewares/multer.js').default;

//upload a list of class advisers using CSV
router.post('/usingCSV', upload.single('class_adviser_information'), classAdviserController.createClassAdvisersFromCSV);

//get specific class adivser
router.get('/:userID/getClassAdviser', classAdviserController.getClassAdviserByID);

//get all class advisers from the list
router.get('/getAllClassAdviser', classAdviserController.getAllClassAdvisers);

module.exports = router;