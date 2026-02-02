const express = require('express');
const router = express.Router();

const reportController = require('../controllers/reportController');

router.get('/viewDishes', reportController.viewDishes);

router.post('/addDishes', reportController.addDishes);




module.exports = router;
