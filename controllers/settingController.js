import Setting from "../models/setting.js"; 

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
            {
                setting: 'STUDENT-CLAIM',
                description: 'Controls the time window for students to claim meals.',
                isActive: false, // Default state is OFF until the schedule opens it
                startHour: 10,   // 10:00 AM
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
                endHour: 7,      // 7:30 AM (handled by logic)
                endMinute: 30
            },
            {
                setting: 'ASSIGN-CREDITS',
                description: 'Time trigger to assign credits to students.',
                isActive: false, 
                startHour: 9,    // 9:00 AM
                startMinute: 0,
            },
            {
                setting: 'REMOVE-CREDITS',
                description: 'Time trigger to reset daily credits.',
                isActive: false,
                startHour: 15, 
                startMinute: 0,
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
        // Expecting route: /settings/:settingName
        const settingName = req.params.settingName; 
        
        const foundSetting = await Setting.findOne({ setting: settingName });
        
        if (!foundSetting) {
            return res.status(404).json({ message: "Setting not found" });
        }
        res.status(200).json(foundSetting); // Return the object directly
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
            endMinute
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

        // Reset execution tracker so if you change time to "now", it can run again if needed
        // (Optional logic, depends on preference)
        // existingSetting.lastExecutedDate = null; 

        await existingSetting.save();

        res.status(200).json({ 
            message: `Setting '${settingName}' updated successfully`, 
            data: existingSetting 
        });

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
    editSetting
};