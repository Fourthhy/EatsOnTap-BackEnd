import Setting from "../models/setting.js";
import moment from 'moment-timezone'; // 🟢 Use moment for clean, reliable timezone math

import { assignCreditsForEvents } from "../controllers/claimController.js";
import { initializeDailyStudentRecord, finalizeTodayRecord } from '../controllers/reportController.js';
import { claimStatusResetLogic } from "../controllers/eligibilityController.js";
import { updateEventStatusesLogic } from "../controllers/eventController.js";
import { checkAndCreateMonthlyReport, initializeDailyReportLogic } from "../update/cron/analyticsCron.js";
import { higherEdStudentManagement } from "../controllers/programScheduleController.js"

// 🟢 REFACTORED: Ultra-clean date getters using moment-timezone
const getTodayDate = () => moment().tz("Asia/Manila").format('YYYY-MM-DD');
const getTodayDayName = () => moment().tz("Asia/Manila").format('dddd').toUpperCase(); // "MONDAY"

const executeTaskLogic = async (setting) => {
    switch (setting.setting) {
        //MIDNIGHT TRIGGER SETTINGS
        case 'UPDATE-EVENTS':
            await updateEventStatusesLogic();
            console.log('Daily Update of Events');
            break;

        case 'CHECK-MONTHLY-REPORT':
            await checkAndCreateMonthlyReport();
            console.log('Checked and Created Monthly Report if needed');
            break;

        case 'MORNING-SETUP':
            console.log("--> Initiating Morning Setup Sequence...");

            const todayStr = getTodayDate();
            const suspendedDates = setting.suspendedDates || [];
            const suspension = suspendedDates.find(d => d.date === todayStr);

            if (suspension) {
                console.log(`🚨 MEALS SUSPENDED TODAY. Reason: "${suspension.reason}". Skipping Daily Report & Higher Ed Allocation.`);
                break;
            }

            await initializeDailyStudentRecord();
            console.log("Executed initialize today record");

            // STEP 1: Build the blank canvas for today
            await initializeDailyReportLogic();
            console.log("Morning setup complete. Daily report initialized and Higher Ed automated.");
            break;
            
        //DAYLIGHT TRIGGER SETTINGS

        case 'ASSIGN-CREDITS':
            await higherEdStudentManagement();
            console.log("Executed assign credits for Higher Ed");

            await assignCreditsForEvents();
            console.log("Executed assign credits for events");
            break;

        //END OF DAY TRIGGER SETTINGS
        case 'END-OF-DAY-SWEEP':
            console.log("--> Initiating Midnight Sweep Sequence...");
            await finalizeTodayRecord();
            console.log("Executed finalize record & remove credits");
            break;
    }
};

const handleSystemPulse = async (req, res, next) => {
    try {
        if (req.headers['eats-on-tap-scheduler-key'] !== process.env.SCHEDULER_SECRET) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        // Use moment to get precise time data cleanly
        const manilaTime = moment().tz("Asia/Manila");
        const manilaHour = manilaTime.hour();
        const manilaMinute = manilaTime.minute();
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
            else {
                if (setting.lastExecutedDate !== todayDateStr && currentTotalMinutes >= startTotalMinutes) {
                    // 🟢 FIXED: Pass the whole setting object, not just the string!
                    await executeTaskLogic(setting);

                    setting.lastExecutedDate = todayDateStr;
                    await setting.save();

                    console.log(`EXECUTED ONE-TIME TASK: ${setting.setting}`);
                }
            }
        }

        return res.status(200).json({ message: "Pulse Checked" });

    } catch (error) {
        next(error);
    }
};

export { handleSystemPulse };