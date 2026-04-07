import Student from "../models/student.js";
import classAdviser from "../models/classAdviser.js";

import eligibilityBasicEd from "../models/eligibilityBasicEd.js"
import eligibilityHigherEd from "../models/eligibilityHigherEd.js";
import Event from "../models/event.js"

import ClaimRecord from "../models/claimRecord.js"

import SectionProgram from "../models/sectionprogram.js"

// =========================================================
// 🟢 NEW HELPER: Department Sorter (DRY Principle)
// =========================================================
const getStudentDepartment = (yearStr, section, program) => {
    // 1. Higher Ed Check
    if (program) return "higherEducation";

    // 2. Invalid Check (No program AND no section)
    if (!section) return null;

    // 3. Basic Ed Bucket Sort
    const yearVal = parseInt(yearStr, 10);
    if (isNaN(yearVal) || yearVal === 0) return "preschool";
    if (yearVal >= 1 && yearVal <= 3) return "primaryEducation";
    if (yearVal >= 4 && yearVal <= 6) return "intermediate";
    if (yearVal >= 7 && yearVal <= 10) return "juniorHighSchool";
    if (yearVal >= 11 && yearVal <= 12) return "seniorHighSchool";

    return "preschool"; // Fallback
};

const getPHDateRange = () => {
    const now = new Date();

    // 1. Get the current calendar date specifically in Manila time.
    // Using 'en-CA' safely forces the output into a strict "YYYY-MM-DD" format.
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const manilaDateStr = formatter.format(now);

    // 2. Construct the exact start and end of that specific Manila day.
    // Appending +08:00 forces JavaScript to parse it as Philippine Time, 
    // which it then correctly translates back into UTC for MongoDB to query.
    const start = new Date(`${manilaDateStr}T00:00:00.000+08:00`);
    const end = new Date(`${manilaDateStr}T23:59:59.999+08:00`);

    return { start, end };
};

// =====================================================================
// 🟢 REFACTORED: SCHOOL DATA & STRUCTURE (Using the DRY Helper)
// =====================================================================
const getUnifiedSchoolData = async (req, res) => {
    try {
        const [students, advisers] = await Promise.all([
            Student.find({}).lean(),
            classAdviser.find({}).lean()
        ]);

        const adviserMap = {};
        advisers.forEach(adv => {
            const fullName = `${!adv.honorific ? "" : adv.honorific} ${adv.first_name} ${adv.last_name}`.trim();
            adviserMap[adv.section] = fullName;
        });

        const departmentsMap = { preschool: {}, primaryEducation: {}, intermediate: {}, juniorHighSchool: {}, seniorHighSchool: {}, higherEducation: {} };
        const parseYear = (yearStr) => parseInt(yearStr, 10);

        students.forEach(student => {
            // 🟢 The DRY Helper in action!
            const deptKey = getStudentDepartment(student.year, student.section, student.program);
            if (!deptKey) return; // Skip invalid

            if (!departmentsMap[deptKey][student.year]) departmentsMap[deptKey][student.year] = {};

            const groupName = deptKey === "higherEducation" ? student.program : student.section;
            if (!departmentsMap[deptKey][student.year][groupName]) departmentsMap[deptKey][student.year][groupName] = [];

            departmentsMap[deptKey][student.year][groupName].push(student);
        });

        const responseData = Object.keys(departmentsMap).map(deptKey => {
            const yearsObj = departmentsMap[deptKey];
            const levels = Object.keys(yearsObj).map(yearKey => {
                const groupsObj = yearsObj[yearKey];
                const groups = Object.keys(groupsObj).map(groupKey => {
                    const rawStudentList = groupsObj[groupKey];
                    const processedStudents = rawStudentList.map(s => ({
                        id: s._id,
                        name: `${s.first_name} ${s.middle_name || ''} ${s.last_name}`.replace(/\s+/g, ' ').trim(),
                        studentId: s.studentID,
                        type: "Regular",
                        isLinked: (s.rfidTag && s.rfidTag.length > 0) ? true : false,
                        gradeLevel: s.year,
                        program: deptKey === "higherEducation" ? groupKey : null,
                        section: deptKey !== "higherEducation" ? groupKey : null
                    }));

                    return {
                        section: groupKey,
                        studentCount: processedStudents.length,
                        students: processedStudents,
                        adviser: deptKey === "higherEducation" ? "N/A" : (adviserMap[groupKey] || "Unassigned")
                    };
                });

                return { levelName: yearKey, sections: groups };
            });

            levels.sort((a, b) => (parseYear(a.levelName) || -1) - (parseYear(b.levelName) || -1));
            return { category: deptKey, levels: levels };
        });

        return res.status(200).json(responseData);
    } catch (error) {
        console.error("Aggregation Error:", error);
        return res.status(500).json({ error: "Failed to aggregate student list" });
    }
};

const getSchoolStructure = async (req, res, next) => {
    try {
        const students = await Student.find({}, 'year section program').lean();
        const departmentsMap = { preschool: {}, primaryEducation: {}, intermediate: {}, juniorHighSchool: {}, seniorHighSchool: {}, higherEducation: {} };
        const parseYear = (yearStr) => parseInt(yearStr, 10);

        students.forEach(student => {
            // 🟢 The DRY Helper in action again!
            const deptKey = getStudentDepartment(student.year, student.section, student.program);
            if (!deptKey) return;

            if (!departmentsMap[deptKey][student.year]) {
                departmentsMap[deptKey][student.year] = new Set();
            }

            const entryName = deptKey === "higherEducation" ? student.program : student.section;
            if (entryName) departmentsMap[deptKey][student.year].add(entryName);
        });

        const responseData = Object.keys(departmentsMap).map(deptKey => {
            const yearsObj = departmentsMap[deptKey];
            const levels = Object.keys(yearsObj).map(yearKey => {
                return {
                    levelName: yearKey,
                    sections: Array.from(yearsObj[yearKey]).sort()
                };
            });

            levels.sort((a, b) => (parseYear(a.levelName) || -1) - (parseYear(b.levelName) || -1));
            return { category: deptKey, levels: levels };
        });

        const cleanResponse = responseData.filter(dept => dept.levels.length > 0);
        return res.status(200).json(cleanResponse);
    } catch (error) {
        next(error);
    }
};

const getStudentClaimReports = async (req, res) => {
    try {
        const [students, advisers] = await Promise.all([
            Student.find({}).select('first_name middle_name last_name section program year claimRecords').lean(),
            classAdviser.find({}).lean()
        ]);

        const adviserMap = {};
        advisers.forEach(adv => {
            const fullName = `${!adv.honorific ? "" : adv.honorific} ${adv.first_name} ${adv.last_name}`.trim();
            adviserMap[adv.section] = fullName;
        });

        const departmentsMap = { preschool: {}, primaryEducation: {}, intermediate: {}, juniorHighSchool: {}, seniorHighSchool: {}, higherEducation: {} };
        const parseYear = (yearStr) => parseInt(yearStr, 10);

        students.forEach(student => {
            // 🟢 The DRY Helper saves the day a third time!
            const deptKey = getStudentDepartment(student.year, student.section, student.program);
            if (!deptKey) return;

            if (!departmentsMap[deptKey][student.year]) departmentsMap[deptKey][student.year] = {};

            const groupName = deptKey === "higherEducation" ? student.program : student.section;
            if (!departmentsMap[deptKey][student.year][groupName]) departmentsMap[deptKey][student.year][groupName] = [];

            departmentsMap[deptKey][student.year][groupName].push(student);
        });

        const responseData = Object.keys(departmentsMap).map(deptKey => {
            const yearsObj = departmentsMap[deptKey];
            const levels = Object.keys(yearsObj).map(yearKey => {
                const groupsObj = yearsObj[yearKey];
                const groups = Object.keys(groupsObj).map(groupKey => {
                    const rawStudentList = groupsObj[groupKey];
                    const processedStudents = rawStudentList.map(s => ({
                        name: `${s.first_name} ${s.middle_name || ''} ${s.last_name}`.replace(/\s+/g, ' ').trim(),
                        section: deptKey === "higherEducation" ? groupKey : s.section,
                        gradeLevel: s.year,
                        claimRecords: s.claimRecords || []
                    }));

                    return {
                        section: groupKey,
                        studentCount: processedStudents.length,
                        students: processedStudents,
                        adviser: deptKey === "higherEducation" ? "N/A" : (adviserMap[groupKey] || "Unassigned")
                    };
                });

                return { levelName: yearKey, sections: groups };
            });

            levels.sort((a, b) => (parseYear(a.levelName) || -1) - (parseYear(b.levelName) || -1));
            return { category: deptKey, levels: levels };
        });

        return res.status(200).json(responseData);
    } catch (error) {
        return res.status(500).json({ error: "Failed to generate claim report" });
    }
};

// =====================================================================
// 🟢 REFACTORED: DAILY FETCHERS (Timezone Locked & Cleaned)
// =====================================================================
const getAllBasicEducationMealRequest = async (req, res, next) => {
    try {
        // 🟢 Replaced 15 lines of manual UTC/Manila math with 1 line!
        const { start, end } = getPHDateRange();

        const allBasicEducationMealRequest = await eligibilityBasicEd.find({
            timeStamp: { $gte: start, $lte: end }
        });

        return res.status(200).json(allBasicEducationMealRequest);
    } catch (error) {
        next(error);
    }
};

const getAllHigherEducationMealRequest = async (req, res, next) => {
    try {
        // 🟢 Replaced manual UTC/Manila math with 1 line!
        const { start, end } = getPHDateRange();

        const allHigherEducationMealRequest = await eligibilityHigherEd.find({
            timeStamp: { $gte: start, $lte: end }
        });

        return res.status(200).json(allHigherEducationMealRequest);
    } catch (error) {
        next(error);
    }
};

const getTodayClaimRecord = async (req, res, next) => {
    try {
        // 🟢 Replaced the buggy "Server Time" fetch with strict Manila Time!
        const { start, end } = getPHDateRange();

        const todayRecord = await ClaimRecord.findOne({
            claimDate: { $gte: start, $lte: end }
        });

        if (!todayRecord) {
            console.warn("There are no records for today!");
        }

        return res.status(200).json(todayRecord);
    } catch (error) {
        next(error);
    }
};

// =====================================================================
// 🟢 REFACTORED: UTILITIES (Crash Bug Fixed)
// =====================================================================
const getAllClassAdvisers = async (req, res, next) => {
    try {
        const allClassAdvisers = await classAdviser.find();
        if (!allClassAdvisers || allClassAdvisers.length === 0) {
            // 🟢 CRASH BUG FIXED: Added missing 'return'
            return res.status(404).json({ message: "There are no Class Advisers!" });
        }
        return res.status(200).json(allClassAdvisers);
    } catch (error) {
        next(error);
    }
};

const getClassAdvisers = async (req, res, next) => {
    try {
        const advisers = await classAdviser.find({}).select('-email -password').lean(); // Note: Changed to lowercase 'classAdviser' assuming it matches your import

        const formattedData = advisers.map(adviser => {
            const middle = adviser.middle_name ? ` ${adviser.middle_name}` : '';
            return {
                _id: adviser._id,
                userID: adviser.userID,
                name: `${adviser.honorific} ${adviser.first_name}${middle} ${adviser.last_name}`,
                role: adviser.role,
                section: adviser.section
            };
        });

        return res.status(200).json(formattedData);
    } catch (error) {
        next(error);
    }
};

const getAllEvents = async (req, res, next) => {
    try {
        const allEvents = await Event.find();
        return res.status(200).json(allEvents);
    } catch (error) {
        next(error);
    }
};

const getAllSectionProgramList = async (req, res, next) => {
    try {
        const allSections = await SectionProgram.find({}).lean().sort({ department: 1, year: 1, section: 1, program: 1 });
        if (!allSections || allSections.length === 0) {
            return res.status(200).json({ message: "No section programs found." });
        }
        return res.status(200).json({
            message: "Successfully fetched all section programs",
            count: allSections.length,
            data: allSections
        });
    } catch (error) {
        next(error);
    }
};

const getStudentsWithProgramOnly = async (req, res, next) => {
    try {
        const students = await Student.find({
            program: { $exists: true, $ne: null, $ne: "" },
            $or: [{ section: { $exists: false } }, { section: null }, { section: "" }]
        });

        if (students.length === 0) {
            // 🟢 Added 'return' here as well just to be safe!
            return res.status(404).json({ message: "No students found with only a Program defined." });
        }

        return res.status(200).json({
            message: "Successfully fetched Higher Education students",
            count: students.length,
            data: students
        });
    } catch (error) {
        next(error);
    }
};

export {
    getUnifiedSchoolData,
    getAllClassAdvisers,
    getAllBasicEducationMealRequest,
    getAllHigherEducationMealRequest,
    getAllEvents,
    getTodayClaimRecord,
    getStudentClaimReports,
    getAllSectionProgramList,
    getClassAdvisers,
    getStudentsWithProgramOnly,
    getSchoolStructure
};