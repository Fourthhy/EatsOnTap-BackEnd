const express = require('express');
const router = express.Router();

const adminAssistantController = require('../controllers/adminAssistantController');

//Router for fetching data about admin assistant
router.get('/', adminAssistantController.getAdminAssistant);

module.exports = router;