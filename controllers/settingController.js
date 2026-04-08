import Setting from "../models/setting.js";
import moment from "moment-timezone";

// 1. Initialize Defaults (Run this once)
const createDefaultSetting = async (req, res, next) => {
    try {
        const existingSettings = await Setting.find({});
        if (existingSettings.length > 0) {
            return res.status(200).json({
                message: "Default settings already initialized.",
                data: existingSettings
            });
        }

        const defaultSettings = [
            //MIDNIGHT TRIGGER SETTINGS
            {
                setting: 'UPDATE-EVENTS',
                description: 'Update of events.',
                isActive: false,
                startHour: 0,
                startMinute: 0,
                endHour: 0,
                endMinute: 0
            },
            {
                setting: 'CHECK-MONTHLY-REPORT',
                description: 'Checking Monthly Report.',
                isActive: false,
                startHour: 0,
                startMinute: 0,
                endHour: 0,
                endMinute: 0
            },
            {
                setting: 'MORNING-SETUP',
                description: 'Checking Daily Report.',
                isActive: false,
                startHour: 0,
                startMinute: 0,
                endHour: 0,
                endMinute: 0
            },
            //DAYLIGHT TRIGGER SETTINGS
            {
                setting: 'ASSIGN-CREDITS',
                description: 'Time trigger to assign credits to students.',
                isActive: false,
                startHour: 8,    // 8:30 AM
                startMinute: 30,
                endHour: 8,
                endMinute: 30
            },
            //END OF DAY TRIGGER SETTINGS
            {
                setting: 'END-OF-DAY-SWEEP',
                description: 'Executes at the end of the day.',
                isActive: false,
                startHour: 15,
                startMinute: 0,
                endHour: 15,
                endMinute: 10
            },
            //SPAN SETTINGS
            {
                setting: 'STUDENT-CLAIM',
                description: 'Controls the time window for students to claim meals.',
                isActive: false, // Default state is OFF until the schedule opens it
                startHour: 9,   // 10:00 AM
                startMinute: 0,
                endHour: 15,     // 3:00 PM
                endMinute: 0
            },
            {
                setting: 'SUBMIT-MEAL-REQUEST',
                description: 'Time window for submitting meal requests.',
                isActive: false,
                startHour: 6,    // 6:00 AM
                startMinute: 0,
                endHour: 7,
                endMinute: 30
            },
            {
                setting: 'MASTER-SETTING',
                description: 'Master setting that controls the activness of the rest of the settings',
                isActive: false,
                startHour: 6,
                startMinute: 0,
                endHour: 7,
                endMinute: 30
            }
        ];

        const newSettings = await Setting.insertMany(defaultSettings);

        res.status(201).json({
            message: "Default system settings initialized successfully.",
            count: newSettings.length,
            data: newSettings
        });

    } catch (error) {
        next(error);
    }
};

// 2. Fetch a specific setting
const fetchSetting = async (req, res, next) => {
    try {
        const { settingName } = req.params;

        const foundSetting = await Setting.findOne({ setting: settingName });

        if (!foundSetting) {
            return res.status(404).json({ message: "Setting not found" });
        }
        res.status(200).json(foundSetting);
    } catch (error) {
        next(error);
    }
};

// 3. Fetch ALL settings (Useful for Admin Dashboard)
const fetchAllSettings = async (req, res, next) => {
    try {
        const settings = await Setting.find({});
        res.status(200).json(settings);
    } catch (error) {
        next(error);
    }
};

// 4. Manually Enable a Feature (Emergency Override)
const enableSetting = async (req, res, next) => {
    try {
        const settingName = req.params.settingName;

        const updatedSetting = await Setting.findOneAndUpdate(
            { setting: settingName },
            { isActive: true },
            { new: true }
        );

        if (!updatedSetting) return res.status(404).json({ message: "Setting not found" });

        res.status(200).json({
            message: `${updatedSetting.setting} is now ENABLED (Active).`,
            data: updatedSetting
        });
    } catch (error) {
        next(error);
    }
};

// 5. Manually Disable a Feature (Emergency Override)
const disableSetting = async (req, res, next) => {
    try {
        const settingName = req.params.settingName;

        const updatedSetting = await Setting.findOneAndUpdate(
            { setting: settingName },
            { isActive: false },
            { new: true }
        );

        if (!updatedSetting) return res.status(404).json({ message: "Setting not found" });

        res.status(200).json({
            message: `${updatedSetting.setting} is now DISABLED (Inactive).`,
            data: updatedSetting
        });
    } catch (error) {
        next(error);
    }
};

// 6. Edit Schedule Times
const editSetting = async (req, res, next) => {
    try {
        const {
            settingName, // The ID to search for
            description,
            startHour,
            startMinute,
            endHour,
            endMinute,
            lastExecutedDate
        } = req.body;

        const existingSetting = await Setting.findOne({ setting: settingName });

        if (!existingSetting) {
            return res.status(404).json({ message: `Setting '${settingName}' not found` });
        }

        // Update fields if provided
        if (description !== undefined) existingSetting.description = description;
        if (startHour !== undefined) existingSetting.startHour = startHour;
        if (startMinute !== undefined) existingSetting.startMinute = startMinute;
        if (endHour !== undefined) existingSetting.endHour = endHour;
        if (endMinute !== undefined) existingSetting.endMinute = endMinute;
        if (lastExecutedDate !== undefined) existingSetting.lastExecutedDate = lastExecutedDate;

        await existingSetting.save();

        res.status(200).json({
            message: `Setting '${settingName}' updated successfully`,
            data: existingSetting
        });

    } catch (error) {
        next(error);
    }
};

const addSetting = async (req, res, next) => {
    try {
        const {
            setting,
            description,
            isActive,
            startHour,
            startMinute,
            endHour,
            endMinute
        } = req.body;

        // 1. Validation
        if (!setting) {
            return res.status(400).json({ message: "Setting name (ID) is required." });
        }

        // 2. Check for Duplicates
        // Using a case-insensitive regex check to prevent 'ASSIGN-CREDITS' and 'assign-credits' duplicates
        const existingSetting = await Setting.findOne({
            setting: { $regex: new RegExp(`^${setting}$`, 'i') }
        });

        if (existingSetting) {
            return res.status(409).json({
                message: `Setting '${setting}' already exists.`
            });
        }

        // 3. Create New Setting
        const newSetting = new Setting({
            setting: setting.toUpperCase(), // Standardize naming (optional, but good for settings)
            description,
            isActive: isActive || false,
            startHour: startHour || 0,
            startMinute: startMinute || 0,
            endHour: endHour || 0,
            endMinute: endMinute || 0,
            // lastExecutedDate defaults to null via Schema
        });

        await newSetting.save();

        res.status(201).json({
            message: "System setting configuration added successfully.",
            data: newSetting
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc   Suspends operations for a given date range
 * @route  POST /api/settings/suspend
 */
const suspendOperations = async (req, res, next) => {
    try {
        const { startDate, endDate, reason } = req.body;

        if (!startDate || !endDate || !reason) {
            return res.status(400).json({ message: "Start date, end date, and reason are required." });
        }

        const start = moment.tz(startDate, "YYYY-MM-DD", "Asia/Manila");
        const end = moment.tz(endDate, "YYYY-MM-DD", "Asia/Manila");

        if (start.isAfter(end)) {
            return res.status(400).json({ message: "Start date cannot be after the end date." });
        }

        // 1. Generate an array of every single date in the range
        const newSuspensions = [];
        const dateStringsToRemove = []; // Used to prevent duplicates
        let current = start.clone();

        while (current.isSameOrBefore(end)) {
            const dateStr = current.format("YYYY-MM-DD");
            newSuspensions.push({ date: dateStr, reason: reason });
            dateStringsToRemove.push(dateStr);

            current.add(1, 'days');
        }

        // 2. Prevent Duplicates: Pull these dates if they already exist, then Push the new ones
        await Setting.updateMany(
            {},
            { $pull: { suspendedDates: { date: { $in: dateStringsToRemove } } } }
        );

        await Setting.updateMany(
            {},
            { $push: { suspendedDates: { $each: newSuspensions } } }
        );

        // 3. Immediate Kill Switch Check
        // If the admin schedules a suspension that includes TODAY, we must instantly 
        // shut down any currently active operational windows.
        const todayStr = moment().tz("Asia/Manila").format("YYYY-MM-DD");
        const suspendsToday = dateStringsToRemove.includes(todayStr);

        if (suspendsToday) {
            await Setting.updateMany(
                { setting: { $in: ['STUDENT-CLAIM', 'SUBMIT-MEAL-REQUEST'] } },
                { $set: { isActive: false } }
            );
            console.log(`[KILL SWITCH] Manual suspension activated for today. All windows forced closed.`);
        }

        return res.status(200).json({
            message: `Operations suspended successfully for ${newSuspensions.length} day(s).`
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc   Force resumes operations by clearing active/future suspensions
 * @route  POST /api/settings/resume
 */
const resumeOperations = async (req, res, next) => {
    try {
        // We only want to delete suspensions from TODAY onwards. 
        // Past suspensions stay in the database for historical record-keeping.
        const todayStr = moment().tz("Asia/Manila").format("YYYY-MM-DD");

        // Remove any suspended date that is greater than or equal to today
        await Setting.updateMany(
            {},
            { $pull: { suspendedDates: { date: { $gte: todayStr } } } }
        );

        console.log(`[RESUME] Operations forced to resume. Future suspensions cleared.`);

        return res.status(200).json({
            message: "Meal operations have been successfully resumed."
        });

    } catch (error) {
        next(error);
    }
};

const getActiveSuspension = async (req, res, next) => {
    try {
        const todayStr = moment().tz("Asia/Manila").format("YYYY-MM-DD");

        // Grab any setting to check the suspendedDates array
        const setting = await Setting.findOne();
        if (!setting || !setting.suspendedDates) {
            return res.status(200).json({ isSuspended: false });
        }

        // Find all suspensions from today onwards
        const activeSuspensions = setting.suspendedDates.filter(d => d.date >= todayStr);

        if (activeSuspensions.length > 0) {
            return res.status(200).json({
                isSuspended: true,
                daysCount: activeSuspensions.length,
                reason: activeSuspensions[0].reason // Grab the reason from the first blocked day
            });
        }

        return res.status(200).json({ isSuspended: false });

    } catch (error) {
        next(error);
    }
};

export {
    createDefaultSetting,
    fetchSetting,
    fetchAllSettings, // Added this extra utility
    enableSetting,
    disableSetting,
    editSetting,
    addSetting,
    suspendOperations,
    resumeOperations,
    getActiveSuspension
};