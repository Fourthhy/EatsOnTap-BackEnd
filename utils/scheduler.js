import cron from 'node-cron';
import Setting from '../models/setting.js';
const TARGET_TIMEZONE = "Asia/Manila";

// Import Controllers
import { 
    assignCredits, 
    removeCredits, 
    assignCreditsForEvents 
} from '../controllers/claimController.js';

import { 
    initializeTodayRecord, 
    finalizeTodayRecord 
} from '../controllers/reportController.js'; 

// 🟢 1. GLOBAL VARIABLE TO TRACK TASKS
let activeTasks = [];

// --- Helper Functions ---
const cronField = (value, fieldType) => {
    if (fieldType === 'dayOfWeek') return value; 
    return value === '0' ? '*' : value;
};

// ... (settingActive and settingInactive functions remain the same) ...
const settingActive = async (SETTING_NAME) => { /* ... code ... */ };
const settingInactive = async (SETTING_NAME) => { /* ... code ... */ };

const getSettingCronExpressions = async (settingName) => {
    // ... (This function remains exactly the same) ...
    if (!settingName) return [];
    const settings = await Setting.findOne({ setting: settingName });
    if (!settings) return [];

    const startFields = [
        settings.startMinute, settings.startHour,
        cronField(settings.startDay, ''), cronField(settings.startMonth, ''),
        cronField(settings.startDayOfWeek, 'dayOfWeek')
    ];
    const endFields = [
        settings.endMinute, settings.endHour,
        cronField(settings.endDay, ''), cronField(settings.endMonth, ''),
        cronField(settings.endDayOfWeek, 'dayOfWeek')
    ];

    return [
        { type: 'start', expression: startFields.join(' ') },
        { type: 'end', expression: endFields.join(' ') }
    ];
};

const executeSetting = async (SETTING_NAME) => {
    // ... (This function remains exactly the same) ...
    // COPY PASTE your switch cases here (SCHEDULE-ASSIGN-CREDITS, SUBMIT-MEAL-REQUEST, etc.)
    // I am omitting the body for brevity, but keep your existing logic!
    console.log(`Executing ${SETTING_NAME}`); 
}


// 🟢 2. STOP FUNCTION (The Cleanup Crew)
const stopScheduler = () => {
    if (activeTasks.length > 0) {
        console.log(`🛑 Stopping ${activeTasks.length} active cron jobs...`);
        activeTasks.forEach(task => task.stop());
        activeTasks = []; // Clear the array
        console.log('✨ Previous schedules cleared.');
    }
};


// --- Main Scheduler ---
const startScheduler = async () => {
    
    // 🟢 Step 1: Always stop old tasks first!
    stopScheduler();

    console.log('🔄 Loading settings from database...');
    const allSettings = await Setting.find();
    
    // Helper to register a task and track it
    const scheduleTask = (expression, func, description) => {
        // Validate expression before scheduling to prevent crashes
        if (!cron.validate(expression)) {
            console.error(`❌ Invalid Cron Expression skipped: ${expression} (${description})`);
            return;
        }

        const task = cron.schedule(expression, func, { timezone: TARGET_TIMEZONE });
        activeTasks.push(task); // Store reference
        console.log(`⏰ Scheduled: ${description}`);
    };

    // Define Critical Settings
    const criticalSettings = [
        "SCHEDULE-ASSIGN-CREDITS", 
        "REMOVE-CREDITS", 
        "SUBMIT-MEAL-REQUEST",
        "STUDENT-CLAIM"
    ];

    // Handle Critical Settings
    for (const name of criticalSettings) {
        if (allSettings.some(s => s.setting === name)) {
            const currentSetting = await Setting.findOne({ setting: name });
            
            if (currentSetting.settingEnable === false) {
                console.log(`🤧 ${name} is disabled via Settings.`);
                continue;
            }

            const expressions = await getSettingCronExpressions(name);
            if (expressions && expressions.length > 0) {
                for (const item of expressions) {
                    if (item.type === 'start') {
                        scheduleTask(
                            item.expression, 
                            () => executeSetting(name), 
                            `START of ${name} at ${item.expression}`
                        );
                    } else if (item.type === 'end') {
                        scheduleTask(
                            item.expression, 
                            () => settingInactive(name), 
                            `END of ${name} at ${item.expression}`
                        );
                    }
                }
            }
        }
    }

    // Handle Generic Settings
    for (const setting of allSettings) {
        const name = setting.setting;
        if (criticalSettings.includes(name)) continue; // Skip priority ones

        if (setting.settingEnable === false) {
            console.log(`🤧 ${name} is disabled.`);
            continue;
        }

        const expressions = await getSettingCronExpressions(name);
        for (const item of expressions) {
            const taskFunc = item.type === 'start' ? () => settingActive(name) : () => settingInactive(name);
            const desc = `${item.type.toUpperCase()} of ${name} at ${item.expression}`;
            
            scheduleTask(item.expression, taskFunc, desc);
        }
    }

    console.log(`\n🚀 Cron Scheduler running with ${activeTasks.length} active jobs.`);
};

// 🟢 Export both start (for server boot) and restart (for updates)
// They are actually the same function now because startScheduler handles the cleanup internally.
export {
    startScheduler as restartScheduler, // Alias for clarity when importing in controllers
    startScheduler
};