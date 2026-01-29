// Ensure you use require if your project is CommonJS (as established earlier)
import ProgramSchedule from "../models/ProgramSchedule.js";

const addProgramSchedule = async (req, res, next) => {
    try {
        const { programName, year, dayOfWeek } = req.body;

        // 1. Basic Validation
        if (!programName || !year || !dayOfWeek) {
            return res.status(400).json({
                message: "Please provide Program Name, Year, and Days of Week."
            });
        }

        // 2. Enum Validation (Optional, but good for clean error messages)
        const validDays = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
        const invalidDays = dayOfWeek.filter(day => !validDays.includes(day.toUpperCase()));

        if (invalidDays.length > 0) {
            return res.status(400).json({
                message: `Invalid days provided: ${invalidDays.join(", ")}. Use full UPPERCASE names (e.g., MONDAY).`
            });
        }

        // 3. Upsert (Update if exists, Insert if new)
        // We find the record by Program + Year.
        const filter = {
            programName: programName.trim(),
            year: year.trim()
        };

        const update = {
            $set: {
                dayOfWeek: dayOfWeek.map(d => d.toUpperCase()) // Ensure consistency
            }
        };

        const options = {
            new: true,   // Return the updated document
            upsert: true, // Create if it doesn't exist
            setDefaultsOnInsert: true
        };

        const result = await ProgramSchedule.findOneAndUpdate(filter, update, options);

        // 4. Send Response
        res.status(200).json({
            message: "Schedule set successfully.",
            data: result
        });

    } catch (error) {
        next(error);
    }
};

const viewProgramSchedule = async (req, res, next) => {
    try {
        const { programName, year } = req.body;

        if (!programName || !year) {
            return res.status(400).json({
                message: "Please provide both Program Name and Year to view the schedule."
            });
        }

        const schedule = await ProgramSchedule.findOne({
            programName: programName.trim(),
            year: year.trim()
        });

        if (!schedule) {
            return res.status(404).json({
                message: `No schedule found for ${programName} - ${year}`
            });
        }

        res.status(200).json(schedule);

    } catch (error) {
        next(error);
    }
};

const viewAllProgramSchedule = async (req, res, next) => {
    try {
        // Fetch all and sort by Program Name (A-Z), then by Year (A-Z)
        const allSchedules = await ProgramSchedule.find({})
            .sort({ programName: 1, year: 1 });

        // Return empty array [] is valid if no schedules exist yet
        res.status(200).json(allSchedules);

    } catch (error) {
        next(error);
    }
};

const editProgramSchedule = async (req, res, next) => {
    try {
        const {
            // Identifiers (Required to find the record)
            currentProgramName,
            currentYear,

            // New Values (Optional - if blank/missing, keep old values)
            newProgramName,
            newYear,
            dayOfWeek
        } = req.body;

        // 1. Validation: We MUST have identifiers to find the correct schedule
        if (!currentProgramName || !currentYear) {
            return res.status(400).json({
                message: "Please provide 'currentProgramName' and 'currentYear' to identify the schedule."
            });
        }

        // 2. Find existing record
        const schedule = await ProgramSchedule.findOne({
            programName: currentProgramName,
            year: currentYear
        });

        if (!schedule) {
            return res.status(404).json({
                message: `Schedule not found for ${currentProgramName} - Year ${currentYear}`
            });
        }

        // 3. Selective Updates: Only update if value is provided and not empty string
        if (newProgramName && newProgramName.trim() !== "") {
            schedule.programName = newProgramName;
        }

        if (newYear && newYear.trim() !== "") {
            schedule.year = newYear;
        }

        // For arrays, we check if it's strictly an array (even empty array [] is valid if you want to clear days)
        // If you want to prevent clearing days with [], change to: if (dayOfWeek && dayOfWeek.length > 0)
        if (Array.isArray(dayOfWeek)) {
            schedule.dayOfWeek = dayOfWeek;
        }

        // 4. Save Changes
        await schedule.save();

        res.status(200).json({
            message: "Program Schedule updated successfully",
            data: schedule
        });

    } catch (error) {
        // Handle Duplicate Key Error (E11000)
        // Occurs if you rename "BSIT 1" to "BSIT 2" but "BSIT 2" already exists
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Cannot update: A schedule for this Program and Year already exists."
            });
        }
        next(error);
    }
};



export {
    addProgramSchedule,
    viewProgramSchedule,
    viewAllProgramSchedule,
    editProgramSchedule
};