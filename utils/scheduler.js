import cron from 'node-cron';
import Setting from '../models/setting.js';
const TARGET_TIMEZONE = "Asia/Manila";

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

    // Run these once:
    if (allSettings.some(s => s.setting === "SCHEDULE-ASSIGN-CREDITS")) {
        await executeSetting("SCHEDULE-ASSIGN-CREDITS");
    }
    if (allSettings.some(s => s.setting === "REMOVE-CREDITS")) {
        await executeSetting("REMOVE-CREDITS");
    }

    // Schedule for the rest:
    for (const setting of allSettings) {
        const settingName = setting.setting;

        // Skip the one-time jobs
        if (
            settingName === "SCHEDULE-ASSIGN-CREDITS" ||
            settingName === "REMOVE-CREDITS"
        ) {
            continue;
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
            console.log(`✅ Scheduled: ${item.type.toUpperCase()} of ${settingName} at ${item.expression}`);
        }
    }
    console.log(`\nCron Scheduler is running and configured for ${TARGET_TIMEZONE}.`);
};



export {
    startScheduler
};
