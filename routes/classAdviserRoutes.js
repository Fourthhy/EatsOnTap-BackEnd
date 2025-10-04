const express = require('express');
const router = express.Router();

const classAdviserController = require('../controllers/classAdviserController');

const upload = require('../middlewares/multer.js').default;

router.post('/usingCSV', upload.single('class_adviser_information'), classAdviserController.createClassAdvisersFromCSV);

module.exports = router;