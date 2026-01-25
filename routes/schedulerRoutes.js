const express = require('express');
const router = express.Router();
const handleSystemPulse = require('../utils/handleSystemPulse');

router.post('/pulse', handleSystemPulse.handleSystemPulse);

module.exports = router;