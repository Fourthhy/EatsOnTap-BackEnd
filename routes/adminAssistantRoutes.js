const express = require('express');
const router = express.Router();

const adminAssistantController = require('../controllers/adminAssistantController');

router.get('/', adminAssistantController.getAdminAssistant);

module.exports = router;