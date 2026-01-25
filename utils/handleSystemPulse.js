import Setting from "../models/setting.js";
import { assignCredits, removeCredits, assignCreditsForEvents } from "../controllers/claimController.js";
import { initializeTodayRecord, finalizeTodayRecord } from '../controllers/reportController.js';

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
            
            const dayToday = getTodayDayName();
            await assignCredits(dayToday); 
            console.log(`Executed assign credits for ${dayToday}`);
            
            await assignCreditsForEvents();
            console.log("Executed assign credits for events");
            break;

        case 'REMOVE-CREDITS': 
            await finalizeTodayRecord();
            await removeCredits();
            console.log("Executed finalize record & remove credits");
            break;
            
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

            if (['STUDENT-CLAIM', 'SUBMIT-MEAL-REQUEST'].includes(setting.setting)) {
                
                const isInsideWindow = currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes;

                if (isInsideWindow) {
                    if (!setting.isActive) {
                        console.log(`Auto-Opening Window: ${setting.setting}`);
                        setting.isActive = true;
                        await setting.save();
                    }
                } else {
                    if (setting.isActive) {
                        console.log(`Auto-Closing Window: ${setting.setting}`);
                        setting.isActive = false;
                        await setting.save();
                    }
                }
            }
            else {
                if (setting.lastExecutedDate !== todayDateStr && currentTotalMinutes >= startTotalMinutes) {
                    await executeTaskLogic(setting.setting);
                    setting.lastExecutedDate = todayDateStr;
                    await setting.save();

                    console.log(`EXECUTED ONE-TIME TASK: ${setting.setting}`);
                }
            }
        }
        res.status(200).json({ message: "Pulse Checked" });
    } catch (error) {
        next(error);
    }
};

export { handleSystemPulse };