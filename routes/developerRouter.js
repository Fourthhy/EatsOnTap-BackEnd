//this router file is only used for development, it will be removed before the handover of the system

const express = require('express');
const router = express.Router();

const developerController = require('../controllers/developerController');
const mockDataController = require('../controllers/mockDataController');

router.put('/removeClaimDetails', developerController.removeClaimDetails);

router.post('/generateMockReports', mockDataController.generateMockReports);

router.post('/getMockStudentClaimReports', mockDataController.getMockStudentClaimReports);

module.exports = router;