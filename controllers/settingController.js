import setting from "../models/setting.js";
import cron from 'node-cron';

const createDefaultSetting = async (req, res, next) => {
    try {
        // Check if any settings already exist to prevent duplicate creation
        const existingSettings = await setting.find({});
        if (existingSettings.length > 0) {
            return res.status(200).json({ message: "Default settings already initialized.", data: existingSettings });
        }

        const defaultSettings = [
            {
                setting: 'STUDENT-CLAIM',
                settingActive: true,
                // Starts 10:00 AM (10) to 3:00 PM (15), every minute, every day.
                settingEnable: true,
                startMinute: '0',
                endMinute: '0',
                startHour: '10', //this indicates as 10 am
                endHour: '15', //this indicates as 3 pm
                startDay: '0',
                endDay: '0',
                startMonth: '0',
                endMonth: '0',
                startDayOfWeek: '0',
                endDayOfWeek: '0'
                //if 0 start and 0 end, it will be indicated as * , meaning all available options

                //if the option is 1 or more, and is the same, it will be indicated as "one-time-execute"
            },
            {
                setting: 'SUBMIT-MEAL-REQUEST',
                settingActive: true,
                // Starts 6:00 AM (6) to 7:30 AM. Using hour range '6-7' covers 6:00-7:59.
                // NOTE: Application logic must manually check for the 7:30 minute boundary.
                settingEnable: true,
                startMinute: '0',
                endMinute: '30',
                startHour: '6',
                endHour: '7',
                startDay: '0',
                endDay: '0',
                startMonth: '0',
                endMonth: '0',
                startDayOfWeek: '0',
                endDayOfWeek: '0'
            },
            {
                setting: 'SCHEDULE-ASSIGN-CREDITS',
                settingActive: false, // Requirement: FALSE by default
                // Placeholder cron values
                settingEnable: false,
                startMinute: '0',
                endMinute: '0',
                startHour: '9',
                endHour: '9',
                startDay: '0',
                endDay: '0',
                startMonth: '0',
                endMonth: '0',
                startDayOfWeek: '0',
                endDayOfWeek: '0'
            },
            {
                setting: 'REMOVE-CREDITS',
                settingActive: true,
                // Executes exactly at 3:00 PM (15), every day.
                settingEnable: true,
                startMinute: '0',
                endMinute: '0',
                startHour: '3',
                endHour: '3',
                startDay: '0',
                endDay: '0',
                startMonth: '0',
                endMonth: '0',
                startDayOfWeek: '0',
                endDayOfWeek: '0'
            }
        ];

        // Insert all default settings into the database
        const newSettings = await setting.insertMany(defaultSettings);

        res.status(201).json({
            message: "Default system settings initialized successfully.",
            count: newSettings.length,
            data: newSettings
        });

    } catch (error) {
        console.error("Error creating default settings:", error);
        // Handle Mongoose validation errors if any
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        next(error);
    }
}

const fetchSetting = async (req, res, next) => {
    try {
        const settings = await setting.findOne({ setting: req.params.SETTING_NAME });
        if (!settings) {
            return res.status(404).json({ message: "Setting not found" });
        }
        res.status(200).json({ message: settings });
    } catch (error) {
        next(error); // Passes error to Express error handler
    }
};


const enableSetting = async () => {
    try {
        const settings = await setting.find({ setting: req.params.SETTING_NAME });

        settings.settingEnable = true;
        settings.save();
        res.status(200).json({ message: `${settings.settingName} is not Enabled`});
    } catch (error) {
        throw new Error(error)
    }
}

const disableSetting = async () => {
    try {
        const settings = await setting.find({ setting: req.params.SETTING_NAME });

        settings.settingEnable = false;
        settings.save();
        res.status(200).json({ message: `${settings.settingName} is not Disabled`});
    } catch (error) {
        throw new Error(error)
    }
}



export {
    createDefaultSetting,
    fetchSetting,
    enableSetting,
    disableSetting
}