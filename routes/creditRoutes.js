const express = require('express');
const router = express.Router();

const creditController = require('../controllers/creditController');

router.post('/addCredit', creditController.creditImport);

module.exports = router;