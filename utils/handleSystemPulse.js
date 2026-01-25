import Setting from "../models/setting.js"

import { assignCredits, removeCredits, assignCreditsForEvents } from "../controllers/claimController.js"
import { initializeTodayRecord, finalizeTodayRecord } from '../controllers/reportController.js'

// Helper to get today's date string (Asia/Manila)
const getTodayDate = () => {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); // Returns "2024-03-25"
};

// The Switchboard for Logic
const executeTaskLogic = async (settingName) => {
    switch (settingName) {
        case 'ASSIGN-CREDITS': // Start of Day Logic
            await initializeTodayRecord();
            console.log("Executed initialize today record")
            await assignCredits("MONDAY"); // You might need to dynamically get the day string
            console.log("Executed assign credits")
            await assignCreditsForEvents();
            console.log("Executed assign credits for events")
            await Setting.findOneAndUpdate({ setting: 'SUBMIT-MEAL-REQUEST' }, { isActive: true });
            console.log("Executed true setting active for submit meal request")
            
            break;

        case 'REMOVE-CREDITS': // End of Day Logic
            await finalizeTodayRecord();
            await removeCredits();
            await Setting.findOneAndUpdate({ setting: 'SUBMIT-MEAL-REQUEST' }, { isActive: false });
            await Setting.findOneAndUpdate({ setting: 'STUDENT-CLAIM' }, { isActive: false });
            break;

        case 'STUDENT-CLAIM': // Lunch Logic
            await Setting.findOneAndUpdate({ setting: 'STUDENT-CLAIM' }, { isActive: true });
            break;
        case 'SUBMIT-MEAL-REQUEST': //Submission of Meal Request Logic
            await Setting.findOneAndUpdate({ setting: 'SUBMIT-MEAL-REQUEST' }, { isActive: true });
            break;
    }
};

const handleSystemPulse = async (req, res, next) => {
    try {
        // Security Check
        if (req.headers['eats-on-tap-scheduler-key'] !== process.env.SCHEDULER_SECRET) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const now = new Date();
        const currentHour = now.getHours(); // Server time (Ensure server is UTC or handle timezone math)
        // Convert to Manila Time manually if server is UTC (Render is UTC)
        const manilaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        const manilaHour = manilaTime.getHours();
        const manilaMinute = manilaTime.getMinutes();
        const todayDateStr = getTodayDate();

        console.log(`💓 PULSE RECEIVED at ${manilaHour}:${manilaMinute} (Manila)`);

        // 🟢 Fetch All Settings
        const allSettings = await Setting.find({});

        for (const setting of allSettings) {
            // Check if it already ran today
            if (setting.lastExecutedDate === todayDateStr) {
                continue; // Skip, already done today
            }

            // Check if it is TIME to run
            // Logic: Is current time >= target time?
            const targetTimeInMinutes = (setting.startHour * 60) + setting.startMinute;
            const currentTimeInMinutes = (manilaHour * 60) + manilaMinute;

            // We add a buffer (e.g., only run if we are within 15 mins past the target time) 
            // OR just strictly check if we passed the time.
            if (currentTimeInMinutes >= targetTimeInMinutes) {

                // EXECUTE LOGIC BASED ON NAME
                await executeTaskLogic(setting.setting);

                // 🟢 UPDATE DATABASE: Mark as done for today
                setting.lastExecutedDate = todayDateStr;
                await setting.save();

                console.log(`✅ EXECUTED TASK: ${setting.setting}`);
            }
        }

        res.status(200).json({ message: "Pulse Checked" });

    } catch (error) {
        next(error);
    }
};



export { handleSystemPulse }