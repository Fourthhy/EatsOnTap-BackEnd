const express = require('express');
const router = express.Router();
const systemLoggerController = require('../controllers/systemLoggerController');

// Route: /api/logger/getAllSystemLogs
router.get('/getAllSystemLogs', systemLoggerController.getAllSystemLogs);

module.exports = router;