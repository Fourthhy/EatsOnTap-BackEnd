import cron from 'node-cron';
import Setting from '../models/setting.js';
const TARGET_TIMEZONE = "Asia/Manila";

// 🟢 IMPORT: Claim Logic
import { 
    assignCredits, 
    removeCredits, 
    assignCreditsForEvents 
} from '../controllers/claimController.js';

// 🟢 IMPORT: Report Logic
import { 
    initializeTodayRecord, 
    finalizeTodayRecord 
} from '../controllers/reportController.js'; 

// 🟢 GLOBAL VARIABLE TO TRACK TASKS (For Hot Reloading)
let activeTasks = [];

// --- Helper Functions ---
const cronField = (value, fieldType) => {
    if (fieldType === 'dayOfWeek') {
        return value; // '0' means Sunday
    }
    return value === '0' ? '*' : value;
};

// Enable a setting by its name
const settingActive = async (SETTING_NAME) => {
    try {
        const setting = await Setting.findOneAndUpdate(
            { setting: SETTING_NAME },
            { $set: { settingActive: true } },
            { new: true }
        );
        if (!setting) {
            return console.log(`${SETTING_NAME} is missing. Cannot enable`);
        }
        console.log('----------');
        console.log(`✅ ${SETTING_NAME}: ENABLED at ${new Date().toLocaleTimeString(undefined, { timeZone: TARGET_TIMEZONE })}`);
        console.log('----------');
    } catch (error) {
        console.error(`error enabling setting ${SETTING_NAME}:`, error);
    }
};

// Disable a setting by its name
const settingInactive = async (SETTING_NAME) => {
    try {
        const setting = await Setting.findOneAndUpdate(
            { setting: SETTING_NAME },
            { $set: { settingActive: false } },
            { new: true }
        );
        if (!setting) {
            return console.log(`${SETTING_NAME} is missing. Cannot disable`);
        }
        console.log('----------');
        console.log(`❌ ${SETTING_NAME}: DISABLED at ${new Date().toLocaleTimeString(undefined, { timeZone: TARGET_TIMEZONE })}`);
        console.log('----------');
    } catch (error) {
        console.error(`error disabling setting ${SETTING_NAME}:`, error);
    }
};

// 🟢 THE EXECUTION SWITCHBOARD (Calling the imported functions)
const executeSetting = async (SETTING_NAME) => {
    const dayOfWeek = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
    const now = new Date();
    const todayIndex = now.getDay();
    const dayToday = dayOfWeek[todayIndex];

    switch (SETTING_NAME) {
        case 'SCHEDULE-ASSIGN-CREDITS':
            try {
                // Assign daily credits
                await assignCredits(dayToday);
                // Assign event based credits
                await assignCreditsForEvents();
                console.log('💰 Assigned credit to all approved students in the eligiblity list');
            } catch (error) {
                console.error('Error in scheduled credit assignment', error)
            }
            console.log(`✅ ${SETTING_NAME}: EXECUTED at ${new Date().toLocaleTimeString(undefined, { timeZone: TARGET_TIMEZONE })}`);
            break;

        case 'REMOVE-CREDITS':
            try {
                console.log('⏳ Starting End-of-Day Finalization...');
                
                // 1. Finalize the report (Calculate who claimed vs unclaimed)
                await finalizeTodayRecord();
                
                // 2. Wipe the credits
                await removeCredits();
                
                console.log('✅ Finalized records and removed credits from all students.');
            } catch (error) {
                console.error('Error in scheduled credit removal/finalization:', error);
            }
            console.log(`✅ ${SETTING_NAME}: EXECUTED at ${new Date().toLocaleTimeString(undefined, { timeZone: TARGET_TIMEZONE })}`);
            break;

        case 'SUBMIT-MEAL-REQUEST': 
            try {
                console.log('⏳ Starting Start-of-Day Initialization...');
                
                // 1. Initialize DB Records for Today
                await initializeTodayRecord();
                
                // 2. Turn ON the submission window
                await settingActive(SETTING_NAME);
                
                console.log('✅ Daily student records initialized.');
            } catch (error) {
                console.error('Error in scheduled initialization:', error);
            }
            console.log(`✅ ${SETTING_NAME}: EXECUTED at ${new Date().toLocaleTimeString(undefined, { timeZone: TARGET_TIMEZONE })}`);
            break;

        case 'STUDENT-CLAIM':
            try {
                // Just flip the switch to allow claiming
                await settingActive(SETTING_NAME);
                console.log('🍔 Student Meal Claiming is now OPEN.');
            } catch (error) {
                console.error('Error starting student claim:', error);
            }
            break;
    }
    console.log('----------');
}

// Builds cron expressions array for the setting
const getSettingCronExpressions = async (settingName) => {
    if (!settingName) {
        console.error("settingName argument is required.");
        return [];
    }
    const settings = await Setting.findOne({ setting: settingName });
    if (!settings) {
        console.error(`Setting '${settingName}' not found.`);
        return [];
    }

    // Apply 'cronField' for all cron fields.
    const startFields = [
        settings.startMinute,
        settings.startHour,
        cronField(settings.startDay, ''),
        cronField(settings.startMonth, ''),
        cronField(settings.startDayOfWeek, 'dayOfWeek')
    ];
    const endFields = [
        settings.endMinute,
        settings.endHour,
        cronField(settings.endDay, ''),
        cronField(settings.endMonth, ''),
        cronField(settings.endDayOfWeek, 'dayOfWeek')
    ];

    if (startFields.some(f => f === undefined || f === null)) {
        console.error("One or more 'start' fields are missing in settings:", startFields);
        return [];
    }
    if (endFields.some(f => f === undefined || f === null)) {
        console.error("One or more 'end' fields are missing in settings:", endFields);
        return [];
    }

    return [
        {
            type: 'start',
            expression: startFields.join(' ')
        },
        {
            type: 'end',
            expression: endFields.join(' ')
        }
    ];
};

// 🟢 CLEANUP FUNCTION
const stopScheduler = () => {
    if (activeTasks.length > 0) {
        console.log(`🛑 Stopping ${activeTasks.length} active cron jobs...`);
        activeTasks.forEach(task => task.stop());
        activeTasks = []; // Clear the array
        console.log('✨ Previous schedules cleared.');
    }
};

// --- Main Scheduler Loop ---
const startScheduler = async () => {
    
    // 🟢 Step 1: Always stop old tasks first!
    stopScheduler();

    console.log('🔄 Loading settings from database...');
    const allSettings = await Setting.find();
    
    // Helper to register a task and track it
    const scheduleTask = (expression, func, description) => {
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

    // Handle Generic/Other Settings
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
export {
    startScheduler as restartScheduler, 
    startScheduler
};