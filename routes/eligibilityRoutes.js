const express = require('express');
const router = express.Router();

const eligibilityController = require('../controllers/eligibilityController');

router.post('/submitListforBasicEduc', eligibilityController.submitMealRequestList);

module.exports = router;