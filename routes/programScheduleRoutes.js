const express = require('express');
const router = express.Router();

const programScheduleController = require("../controllers/programScheduleController");

router.post('/addProgramSchedule', programScheduleController.addProgramSchedule);
router.get('/viewProgramSchedule', programScheduleController.viewProgramSchedule);
router.get('/viewAllProgramSchedule', programScheduleController.viewAllProgramSchedule);

module.exports = router;