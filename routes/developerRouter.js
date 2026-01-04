//this router file is only used for development, it will be removed before the handover of the system

const express = require('express');
const router = express.Router();

const developerController = require('../controllers/developerController');

router.put('/removeClaimDetails', developerController.removeClaimDetails);

module.exports = router;