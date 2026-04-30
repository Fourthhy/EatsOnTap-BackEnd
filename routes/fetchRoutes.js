const express = require('express');
const router = express.Router();

const fetchController = require('../controllers/fetchController');
const reportController = require('../controllers/reportController');
const claimController = require('../controllers/claimController');
const notificationController = require('../controllers/notificationController');

// ========= FECTCH CONTROLLER ROUTES =========

router.get('/getAllBasicEducationMealRequest', fetchController.getAllBasicEducationMealRequest);

router.get('/getAllClassAdvisers', fetchController.getAllClassAdvisers);

router.get('/getAllEvents', fetchController.getAllEvents);

router.get('/getAllHigherEducationMealRequest', fetchController.getAllHigherEducationMealRequest);

router.get('/getAllSectionProgramList', fetchController.getAllSectionProgramList);

//not used.
router.get('/getClassAdvisers', fetchController.getClassAdvisers);

router.get('/getSchoolStructure', fetchController.getSchoolStructure);  

router.get('/getStudentClaimReports', fetchController.getStudentClaimReports);

router.get('/getStudentsWithProgramOnly', fetchController.getStudentsWithProgramOnly);

router.get('/getTodayClaimRecord', fetchController.getTodayClaimRecord);

router.get('/getUnifiedSchoolData', fetchController.getUnifiedSchoolData);

// ========= REPORT CONTROLLER ROUTES =========

router.get('/getDashboardData', reportController.getDashboardData);

// not used.
router.get('/getFinancialReport', reportController.getFinancialReport);

// ========= CLAIM CONTROLLER ROUTES =========

router.get('/getApprovedStudentsToday', claimController.getApprovedStudentsToday);

// ========= NOTIFICATION CONTROLLER ROUTES =========

router.post('/fetchNotifications', notificationController.fetchNotifications);

module.exports = router;