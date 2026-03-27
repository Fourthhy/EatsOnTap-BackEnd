import Setting from "../models/setting.js";

import { assignCreditsForEvents, sweepUnclaimedCredits } from "../controllers/claimController.js";
import { initializeTodayRecord, finalizeTodayRecord } from '../controllers/reportController.js';
import { claimStatusResetLogic } from "../controllers/eligibilityController.js";
import { updateEventStatusesLogic } from "../controllers/eventController.js";
import { checkAndCreateMonthlyReport, initializeDailyReportLogic } from "../update/cron/analyticsCron.js";
import { automateHigherEdEligibility } from "../controllers/programScheduleController.js"

const getTodayDate = () => {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); // Returns "2024-03-25"
};

const getTodayDayName = () => {
    const date = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
    return days[date.getDay()];
};

const executeTaskLogic = async (settingName) => {
    switch (settingName) {
        case 'ASSIGN-CREDITS':
            await initializeTodayRecord();
            console.log("Executed initialize today record");

            await claimStatusResetLogic();
            console.log("Executed claim status reset");

            const dayToday = getTodayDayName();
            console.log(`Executed assign credits for ${dayToday}`);

            await assignCreditsForEvents();
            console.log("Executed assign credits for events");
            break;

        case 'REMOVE-CREDITS':
            await finalizeTodayRecord();
            await removeCredits();
            console.log("Executed finalize record & remove credits");
            break;

        case 'UPDATE-EVENTS':
            await updateEventStatusesLogic();
            console.log('Daily Update of Events');


        case 'CHECK-MONTHLY-REPORT':
            await checkAndCreateMonthlyReport();
            console.log('Checked and Created Monthly Report if needed');
            break;

        case 'MORNING-SETUP':
            console.log("--> Initiating Morning Setup Sequence...");
            // STEP 1: Build the blank canvas for today
            const reportResult = await initializeDailyReportLogic();

            // STEP 2: Assign Higher Ed students their credits
            await automateHigherEdEligibility();

            return res.status(200).json({
                message: "Morning setup complete. Daily report initialized and Higher Ed automated.",
                reportStatus: reportResult
            });

        case 'END-OF-DAY-SWEEP':
            console.log("--> Initiating Midnight Sweep Sequence...");
            // STEP 1: Reclaim credits from anyone who didn't eat today
            const sweepResult = await sweepUnclaimedCredits();

            // STEP 2: Check if tomorrow is the 1st of the month to build the new bucket
            const monthlyResult = await checkAndCreateMonthlyReport();

            return res.status(200).json({
                message: "End of day maintenance complete.",
                sweep: sweepResult,
                monthly: monthlyResult
            });
    }
};

const handleSystemPulse = async (req, res, next) => {
    try {
        if (req.headers['eats-on-tap-scheduler-key'] !== process.env.SCHEDULER_SECRET) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const now = new Date();
        // Convert to Manila Time manually
        const manilaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        const manilaHour = manilaTime.getHours();
        const manilaMinute = manilaTime.getMinutes();
        const todayDateStr = getTodayDate();

        const currentTotalMinutes = (manilaHour * 60) + manilaMinute;

        console.log(`PULSE RECEIVED at ${manilaHour}:${manilaMinute} (Manila)`);

        const allSettings = await Setting.find({});

        for (const setting of allSettings) {

            const startTotalMinutes = (setting.startHour * 60) + setting.startMinute;
            const endTotalMinutes = (setting.endHour * 60) + setting.endMinute;

            // =========================================================================
            // 🟢 SPAN FUNCTIONS (TIME WINDOW LOGIC)
            // =========================================================================
            // These tasks have a specific duration (start time AND end time). 
            // The pulse continually checks if the current time falls inside this window.
            // If it does, it toggles the setting isActive to true. Once the current 
            // time passes the end window, it toggles it back to false.
            if (['STUDENT-CLAIM', 'SUBMIT-MEAL-REQUEST'].includes(setting.setting)) {

                const isInsideWindow = currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes;

                if (isInsideWindow) {
                    if (!setting.isActive) {
                        console.log(`Auto-Opening Window: ${setting.setting}`);
                        setting.isActive = true;
                        setting.lastExecutedDate = todayDateStr;
                        await setting.save();
                    }
                } else {
                    if (setting.isActive) {
                        console.log(`Auto-Closing Window: ${setting.setting}`);
                        setting.isActive = false;
                        setting.lastExecutedDate = todayDateStr;
                        await setting.save();
                    }
                }
            }
            // =========================================================================
            // 🔵 ONE-TIME EXECUTE FUNCTIONS (SCHEDULED JOBS)
            // =========================================================================
            // These tasks only have a trigger time (start time), no end time.
            // The pulse checks if the start time has been reached, and ensures 
            // the task has not already been executed today (checking lastExecutedDate).
            // Once executed, it updates the date to prevent duplicate executions.
            else {
                if (setting.lastExecutedDate !== todayDateStr && currentTotalMinutes >= startTotalMinutes) {
                    await executeTaskLogic(setting.setting);
                    setting.lastExecutedDate = todayDateStr;
                    await setting.save();

                    console.log(`EXECUTED ONE-TIME TASK: ${setting.setting}`);
                }
            }
        }

        // Removed res.status(500) from the catch block below since this response ends the cycle cleanly
        return res.status(200).json({ message: "Pulse Checked" });

    } catch (error) {
        next(error);
        // Note: I removed the duplicate res.status(500) here because next(error) will pass it
        // to your global error handler. Having both causes an "headers already sent" crash.
    }
};

export { handleSystemPulse };