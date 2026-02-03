const express = require('express');
const router = express.Router();

const fetchController = require('../controllers/fetchController');
const reportController = require('../controllers/reportController');
const claimController = require('../controllers/claimController');

// === ADMIN FETCHERS === 

router.get('/getUnifiedSchoolData', fetchController.getUnifiedSchoolData);

router.get('/getAllClassAdvisers', fetchController.getAllClassAdvisers);

router.get('/getAllBasicEducationMealRequest', fetchController.getAllBasicEducationMealRequest);

router.get('/getAllHigherEducationMealRequest', fetchController.getAllHigherEducationMealRequest);

router.get('/getAllEvents', fetchController.getAllEvents);

router.get('/getTodayClaimRecord', fetchController.getTodayClaimRecord);

router.get('/getStudentClaimReports', fetchController.getStudentClaimReports);

router.get('/getAllSectionProgramList', fetchController.getAllSectionProgramList);

router.get('/getClassAdvisers', fetchController.getClassAdvisers);

router.get('/getStudentsWithProgramOnly', fetchController.getStudentsWithProgramOnly);

router.get('/getSchoolStructure', fetchController.getSchoolStructure);  

router.get('/getDashboardData', reportController.getDashboardData);

router.get('/getFinancialReport', reportController.getFinancialReport);

router.get('/getApprovedStudentsToday', claimController.getApprovedStudentsToday);

module.exports = router;