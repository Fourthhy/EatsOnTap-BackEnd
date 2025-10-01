const express = require('express');
const router = express.Router();

const loggerController = require('../controllers/loggerController');

//Displaying all logging claima attempt
router.get('/logger', loggerController.getAllLoggingClaimAttempts);

module.exports = router;