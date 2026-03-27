const express = require('express');
const router = express.Router();

const monthlyReportController = require('../cron/analyticsCron');

// Route for checking and creating monthly report if needed
router.post('/manual-trigger/monthly', async (req, res, next) => {
    try {
        const result = await monthlyReportController.checkAndCreateMonthlyReport();
        res.status(200).json({ result, message: "Monthly report check and creation (if needed) executed successfully." });
    } catch (error) {
        console.error("Error executing monthly report logic:", error);
        next(error)
    }
})

// Route for initializing daily report logic
router.post('/manual-trigger/daily', async (req, res, next) => {
    try {
        const result = await monthlyReportController.initializeDailyReportLogic();
        res.status(200).json({ result, message: "Daily report initialization executed successfully." });
    } catch (error) {
        console.error("Error executing daily report initialization logic:", error);
        next(error)
    }
});

module.exports = router;