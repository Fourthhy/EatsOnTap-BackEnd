import cron from 'node-cron';
import Setting from '../models/setting.js';
const TARGET_TIMEZONE = "Asia/Manila";
import { assignCredits, removeCredits } from '../controllers/claimController.js';

// Converts '0' to '*', else keeps actual value as string
const cronField = (value, fieldType) => {
    if (fieldType === 'dayOfWeek') {
        return value; // '0' means Sunday
    }
    return value === '0' ? '*' : value;
};

// Enable a setting by its name (not ID)
const enableSetting = async (SETTING_NAME) => {
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

// Disable a setting by its name (not ID)
const disableSetting = async (SETTING_NAME) => {
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

const executeSetting = async (SETTING_NAME) => {
    switch (SETTING_NAME) {
        case 'SCHEDULE-ASSIGN-CREDITS':
            try {
                await assignCredits();
                console.log('Assigned credit to all approved students in the eligiblity list');
            } catch (error ) {
                console.error('Error in scheduled credit assignment', error)
            }
            console.log('----------');
            console.log(`✅ ${SETTING_NAME}: EXECUTED at ${new Date().toLocaleTimeString(undefined, { timeZone: TARGET_TIMEZONE })}`);
            console.log('----------');
            break;
        case 'REMOVE-CREDITS':
            try {
                await removeCredits();
                console.log('Removed credits from all students with remaining balance');
            } catch (error) {
                console.error('Error in scheduled credit removal:', error);
            }
            console.log('----------');
            console.log(`✅ ${SETTING_NAME}: EXECUTED at ${new Date().toLocaleTimeString(undefined, { timeZone: TARGET_TIMEZONE })}`);
            console.log('----------');
            break;
    }
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


// Scheduler that loops over all settings.
const startScheduler = async () => {
    const allSettings = await Setting.find();

    // Handle SCHEDULE-ASSIGN-CREDITS once (outside the loop)
    if (allSettings.some(s => s.setting === "SCHEDULE-ASSIGN-CREDITS")) {
        const expressions = await getSettingCronExpressions("SCHEDULE-ASSIGN-CREDITS");
        if (expressions && expressions.length > 0) {
            for (const item of expressions) {
                if (item.type === 'start') {
                    cron.schedule(item.expression, () => executeSetting("SCHEDULE-ASSIGN-CREDITS"), {
                        timezone: TARGET_TIMEZONE
                    });
                    console.log(`⏰ Scheduled: START of SCHEDULE-ASSIGN-CREDITS at ${item.expression}`);
                }
            }
        }
    }

    // Handle REMOVE-CREDITS once (outside the loop)
    if (allSettings.some(s => s.setting === "REMOVE-CREDITS")) {
        const expressions = await getSettingCronExpressions("REMOVE-CREDITS");
        if (expressions && expressions.length > 0) {
            for (const item of expressions) {
                if (item.type === 'start') {
                    cron.schedule(item.expression, () => executeSetting("REMOVE-CREDITS"), {
                        timezone: TARGET_TIMEZONE
                    });
                    console.log(`⏰ Scheduled: START of REMOVE-CREDITS at ${item.expression}`);
                }
            }
        }
    }

    // Schedule for all other settings
    for (const setting of allSettings) {
        const settingName = setting.setting;
        if (settingName === "SCHEDULE-ASSIGN-CREDITS" || settingName === "REMOVE-CREDITS") {
            continue; // already scheduled above
        }

        const expressions = await getSettingCronExpressions(settingName);
        if (!expressions || expressions.length === 0) {
            console.log(`Scheduler failed to start: no expression found for ${settingName}`);
            continue;
        }

        for (const item of expressions) {
            let taskFunction;
            if (item.type === 'start') {
                taskFunction = () => enableSetting(settingName);
            } else if (item.type === 'end') {
                taskFunction = () => disableSetting(settingName);
            } else {
                continue;
            }

            cron.schedule(item.expression, taskFunction, {
                timezone: TARGET_TIMEZONE
            });
            console.log(`⏰ Scheduled: ${item.type.toUpperCase()} of ${settingName} at ${item.expression}`);
        }
    }
    console.log(`\nCron Scheduler is running and configured for ${TARGET_TIMEZONE}.`);
};




export {
    startScheduler
};
