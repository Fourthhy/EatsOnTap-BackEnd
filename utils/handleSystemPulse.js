import Setting from "../models/setting.js";
import moment from 'moment-timezone'; 

import { assignCreditsForEvents } from "../controllers/claimController.js";
import { initializeDailyStudentRecord, finalizeTodayRecord } from '../controllers/reportController.js';
import { claimStatusResetLogic } from "../controllers/eligibilityController.js";
import { updateEventStatusesLogic } from "../controllers/eventController.js";
import { checkAndCreateMonthlyReport, initializeDailyReportLogic, purgeExpiredDataSweep } from "../update/cron/analyticsCron.js";
import { higherEdStudentManagement } from "../controllers/programScheduleController.js"

const getTodayDate = () => moment().tz("Asia/Manila").format('YYYY-MM-DD');
const getTodayDayName = () => moment().tz("Asia/Manila").format('dddd').toUpperCase();

const executeTaskLogic = async (setting) => {
    switch (setting.setting) {
        // MIDNIGHT TRIGGER SETTINGS
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
            await initializeDailyStudentRecord();
            console.log("Executed initialize today record");

            // STEP 1: Build the blank canvas for today
            await initializeDailyReportLogic();
            console.log("Morning setup complete. Daily report initialized and Higher Ed automated.");
            break;
            
        // DAYLIGHT TRIGGER SETTINGS
        case 'ASSIGN-CREDITS':
            await higherEdStudentManagement();
            console.log("Executed assign credits for Higher Ed");

            await assignCreditsForEvents();
            console.log("Executed assign credits for events");
            break;

        // END OF DAY TRIGGER SETTINGS
        case 'END-OF-DAY-SWEEP':
            console.log("--> Initiating Midnight Sweep Sequence...");
            await finalizeTodayRecord();
            console.log("Executed finalize record & remove credits");

            await purgeExpiredDataSweep(); 
            console.log("Executed finalize record & executed data purge sweep");
            break;
    }
};

const handleSystemPulse = async (req, res, next) => {
    try {
        if (req.headers['eats-on-tap-scheduler-key'] !== process.env.SCHEDULER_SECRET) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const manilaTime = moment().tz("Asia/Manila");
        const manilaHour = manilaTime.hour();
        const manilaMinute = manilaTime.minute();
        const todayDateStr = getTodayDate();
        const todayDayName = getTodayDayName(); // 🟢 NEW: Grab the current day (e.g., "SUNDAY")

        const currentTotalMinutes = (manilaHour * 60) + manilaMinute;

        console.log(`PULSE RECEIVED at ${manilaHour}:${manilaMinute} (Manila) | Day: ${todayDayName}`);

        const allSettings = await Setting.find({});

        // =========================================================================
        // 🚨 GLOBAL KILL SWITCH: Check if today is a suspended date
        // =========================================================================
        let activeSuspension = null;
        for (const s of allSettings) {
            const found = s.suspendedDates?.find(d => d.date === todayDateStr);
            if (found) {
                activeSuspension = found;
                break;
            }
        }

        if (activeSuspension) {
            console.log(`🚨 SYSTEM SUSPENDED TODAY (${todayDateStr}). Reason: "${activeSuspension.reason}"`);
            
            // Safety Net: Force close any operational windows that might be stuck open
            for (const setting of allSettings) {
                if (['STUDENT-CLAIM', 'SUBMIT-MEAL-REQUEST'].includes(setting.setting)) {
                    if (setting.isActive) {
                        console.log(`[Kill Switch] Forcing ${setting.setting} window to CLOSED.`);
                        setting.isActive = false;
                        await setting.save();
                    }
                }
            }
            
            // EXIT IMMEDIATELY - No windows will open, no tasks will execute.
            return res.status(200).json({ 
                message: `Pulse checked. Operations suspended for today: ${activeSuspension.reason}` 
            });
        }
        // =========================================================================

        // 🟢 NORMAL OPERATIONS RESUME HERE IF NO SUSPENSION FOUND
        for (const setting of allSettings) {

            // =========================================================================
            // 🛑 THE MASTER OVERRIDE CHECK
            // =========================================================================
            if (setting.isEnabled === false) {
                if (setting.isActive) {
                    console.log(`[Master Override] ${setting.setting} is manually disabled. Forcing isActive to false.`);
                    setting.isActive = false;
                    await setting.save();
                }
                continue; // Skip time window checks and task execution entirely
            }

            // =========================================================================
            // 🛑 DAY OF THE WEEK CHECK (THE NEW FEATURE)
            // =========================================================================
            const allowedDays = setting.activeDays?.length > 0 
                ? setting.activeDays 
                : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']; // Fallback: Excludes Sunday by default

            if (!allowedDays.includes(todayDayName)) {
                if (setting.isActive) {
                    console.log(`[Day Restriction] ${setting.setting} does not run on ${todayDayName}. Forcing isActive to false.`);
                    setting.isActive = false;
                    await setting.save();
                }
                continue; // Skip this setting entirely for today
            }
            // =========================================================================

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
                    await executeTaskLogic(setting);

                    setting.lastExecutedDate = todayDateStr;
                    await setting.save();

                    console.log(`EXECUTED ONE-TIME TASK: ${setting.setting}`);
                }
            }
        }

        return res.status(200).json({ message: "Pulse Checked - Operations Normal" });

    } catch (error) {
        next(error);
    }
};

export { handleSystemPulse };