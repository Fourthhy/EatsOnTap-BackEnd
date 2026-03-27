import ProgramSchedule from "../models/ProgramSchedule.js";
import Student from "../models/student.js";
import ClaimRecord from "../models/claimRecord.js";
import mealValue from "../models/mealValue.js"; 
import MonthlyReport from "../models/monthlyReport.js";

// ==========================================
// 1. CRUD OPERATIONS (Admin Assistant)
// ==========================================

const addProgramSchedule = async (req, res, next) => {
    try {
        const { program, year, dayOfWeek, isActive } = req.body;

        if (!program || !year || !dayOfWeek) {
            return res.status(400).json({
                message: "Please provide Program, Year, and Days of Week."
            });
        }

        const validDays = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
        const invalidDays = dayOfWeek.filter(day => !validDays.includes(day.toUpperCase()));

        if (invalidDays.length > 0) {
            return res.status(400).json({
                message: `Invalid days provided: ${invalidDays.join(", ")}. Use full UPPERCASE names.`
            });
        }

        const filter = {
            program: program.trim(),
            year: year.trim()
        };

        const update = {
            $set: {
                dayOfWeek: dayOfWeek.map(d => d.toUpperCase()),
                isActive: isActive !== undefined ? isActive : true 
            }
        };

        const options = {
            new: true,   
            upsert: true, 
            setDefaultsOnInsert: true
        };

        const result = await ProgramSchedule.findOneAndUpdate(filter, update, options);

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
        const { program, year } = req.query;

        if (!program || !year) {
            return res.status(400).json({
                message: "Please provide both Program and Year in the query string to view the schedule."
            });
        }

        const schedule = await ProgramSchedule.findOne({
            program: program.trim(),
            year: year.trim()
        });

        if (!schedule) {
            return res.status(404).json({
                message: `No schedule found for ${program} - ${year}`
            });
        }

        res.status(200).json(schedule);

    } catch (error) {
        next(error);
    }
};

const viewAllProgramSchedule = async (req, res, next) => {
    try {
        const allSchedules = await ProgramSchedule.find({})
            .sort({ program: 1, year: 1 });

        res.status(200).json(allSchedules);

    } catch (error) {
        next(error);
    }
};

const editProgramSchedule = async (req, res, next) => {
    try {
        const {
            currentProgram,
            currentYear,
            newProgram,
            newYear,
            dayOfWeek,
            isActive 
        } = req.body;

        if (!currentProgram || !currentYear) {
            return res.status(400).json({
                message: "Please provide 'currentProgram' and 'currentYear' to identify the schedule."
            });
        }

        const schedule = await ProgramSchedule.findOne({
            program: currentProgram,
            year: currentYear
        });

        if (!schedule) {
            return res.status(404).json({
                message: `Schedule not found for ${currentProgram} - Year ${currentYear}`
            });
        }

        if (newProgram && newProgram.trim() !== "") {
            schedule.program = newProgram;
        }

        if (newYear && newYear.trim() !== "") {
            schedule.year = newYear;
        }

        if (Array.isArray(dayOfWeek)) {
            schedule.dayOfWeek = dayOfWeek;
        }

        if (typeof isActive === 'boolean') {
            schedule.isActive = isActive;
        }

        await schedule.save();

        res.status(200).json({
            message: "Program Schedule updated successfully",
            data: schedule
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Cannot update: A schedule for this Program and Year already exists."
            });
        }
        next(error);
    }
};

// ==========================================
// 2. AUTOMATION (System Pulse)
// ==========================================

/**
 * @desc Automatically assigns ELIGIBLE status, credits, and analytics for Higher Ed students.
 */
const automateHigherEdEligibility = async () => {
    try {
        console.log("⚙️ Starting Higher Ed Daily Automation...");

        const now = new Date();
        const manilaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Manila" });
        const manilaDate = new Date(manilaTimeStr);
        
        const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
        const todayStr = days[manilaDate.getDay()];

        const startOfDay = new Date(manilaDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(manilaDate);
        endOfDay.setHours(23, 59, 59, 999);

        // 1. Find active schedules for today
        const activeSchedules = await ProgramSchedule.find({
            dayOfWeek: todayStr,
            isActive: true
        });

        if (activeSchedules.length === 0) {
            console.log(`✅ No Higher Education programs scheduled for ${todayStr}. Skipping.`);
            return;
        }

        // 2. Build Query and fetch students
        const orConditions = activeSchedules.map(schedule => ({
            program: schedule.program,
            year: schedule.year
        }));

        const eligibleStudents = await Student.find({ $or: orConditions });

        if (eligibleStudents.length === 0) {
            console.log("✅ Schedules found, but no enrolled students matched. Skipping.");
            return;
        }

        // 3. Fetch Meal Value
        const mealSetting = await mealValue.findOne();
        const currentMealValue = mealSetting ? mealSetting.mealValue : 0;

        // 4. Update Claim Record
        let dailyRecord = await ClaimRecord.findOne({
            claimDate: { $gte: startOfDay, $lte: endOfDay }
        });

        if (!dailyRecord) {
            dailyRecord = new ClaimRecord({ claimDate: startOfDay, claimRecords: [] });
        }

        const groupedSections = activeSchedules.map(schedule => {
            const sectionName = `${schedule.program} - ${schedule.year}`; 
            const studentsInProgram = eligibleStudents.filter(
                s => s.program === schedule.program && s.year === schedule.year
            );

            return {
                section: sectionName,
                eligibleStudents: studentsInProgram.map(student => ({
                    studentID: student.studentID,
                    claimType: 'ELIGIBLE',
                    creditBalance: currentMealValue,
                    onHandCash: 0
                })),
                waivedStudents: []
            };
        }).filter(group => group.eligibleStudents.length > 0); 

        groupedSections.forEach(newGroup => {
            const exists = dailyRecord.claimRecords.some(r => r.section === newGroup.section);
            if (!exists) {
                dailyRecord.claimRecords.push(newGroup);
            }
        });

        await dailyRecord.save();

        // 5. Update Monthly Dashboard
        const incEligible = eligibleStudents.length;
        const incCredits = incEligible * currentMealValue;
        const bucketMonth = `${manilaDate.getFullYear()}-${String(manilaDate.getMonth() + 1).padStart(2, '0')}`;

        const reportUpdate = await MonthlyReport.findOneAndUpdate(
            { bucketMonth },
            {
                $inc: {
                    "statistics.totalEligible": incEligible,
                    "financials.totalAllottedCredits": incCredits,
                    "financials.totalUnusedCredits": incCredits, 
                    "dailyReports.$[todayRecord].statistics.totalEligible": incEligible,
                    "dailyReports.$[todayRecord].financials.totalAllottedCredits": incCredits,
                    "dailyReports.$[todayRecord].financials.totalUnusedCredits": incCredits
                }
            },
            {
                new: true,
                arrayFilters: [{ "todayRecord.date": { $gte: startOfDay, $lte: endOfDay } }]
            }
        );

        if (!reportUpdate) console.warn(`⚠️ Dashboard Analytics missing for ${bucketMonth}. Stats skipped.`);

        // 6. Bulk Update Students
        const studentIDsToUpdate = eligibleStudents.map(s => s.studentID);

        await Student.updateMany(
            { studentID: { $in: studentIDsToUpdate } },
            { 
                $set: { 
                    temporaryClaimStatus: "ELIGIBLE", 
                    temporaryCreditBalance: currentMealValue
                } 
            }
        );

        console.log(`✅ Higher Ed Automation Complete! ${incEligible} students marked ELIGIBLE and synced.`);

    } catch (error) {
        console.error("❌ Higher Ed Automation Error:", error);
    }
};

export {
    addProgramSchedule,
    viewProgramSchedule,
    viewAllProgramSchedule,
    editProgramSchedule,
    automateHigherEdEligibility
};