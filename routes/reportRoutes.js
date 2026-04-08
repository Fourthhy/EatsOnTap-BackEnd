const express = require('express');
const router = express.Router();

const reportController = require('../controllers/reportController');

router.get('/viewDishes', reportController.viewDishes);

router.post('/addDishes', reportController.addDishes);

router.post('/initializeDailyReport', reportController.initializeDailyReport);

router.post('/export-and-archive-report', reportController.exportAndArchiveReport);

module.exports = router;
