import Report from "../models/report.js";
import mealValue from "../models/mealValue.js";
import KPIRange from "../models/kpiRange.js";

// ==================================================================
// ⚙️ SHARED CONFIGURATION
// ==================================================================
const STUDENT_POPULATION_LIMIT = 2200;
const MAX_CREDIT = 50;
const DAYS_TO_GENERATE = 100; // 🟢 Shared: Both mocks go back 100 days

// ==================================================================
// 1️⃣ MOCK DASHBOARD REPORTS (SAVES TO DB)
// ==================================================================

const DISH_POOL = [
    "Adobo", "Sinigang", "Menudo", "Afritada", "Fried Chicken",
    "Chop Suey", "Pinakbet", "Bicol Express", "Sisig", "Tinolang Manok",
    "Pork Steak", "Lumpiang Shanghai", "Ginataang Kalabasa", "Monggo"
];

const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const getRandomDishes = () => {
    const shuffled = DISH_POOL.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 2);
};

const generateMockReports = async (req, res) => {
    try {
        console.log(`🚀 STARTING MOCK GENERATION: Backtracking ${DAYS_TO_GENERATE} days from today...`);

        // A. Ensure Settings Exist
        let mealValueDoc = await mealValue.findOne();
        if (!mealValueDoc) {
            mealValueDoc = await mealValue.create({ mealValue: 50 });
        }
        const MEAL_COST = mealValueDoc.mealValue;

        let kpiDoc = await KPIRange.findOne();
        if (!kpiDoc) {
            await KPIRange.create({
                tadmc: { min: 58, max: 62 },
                cur: { min: 90, max: 100 },
                ocf: { min: 0, max: 15 }
            });
        }

        // B. Generate Reports Loop
        const reports = [];
        const today = new Date();

        for (let i = 0; i < DAYS_TO_GENERATE; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);

            // Skip Weekends
            if (d.getDay() === 0 || d.getDay() === 6) continue;

            const day = d.getDate();
            const month = d.getMonth() + 1;
            const year = d.getFullYear();
            const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const dayOfWeek = dayNames[d.getDay()];

            // Simulation Logic
            const dailyPopulation = getRandomInt(2000, STUDENT_POPULATION_LIMIT);
            const claimRate = getRandomInt(60, 90) / 100;
            const totalClaimed = Math.floor(dailyPopulation * claimRate);
            const totalUnclaimed = dailyPopulation - totalClaimed;

            const prePackedCount = Math.floor(totalClaimed * (getRandomInt(65, 75) / 100));
            const customizedCount = totalClaimed - prePackedCount;
            const unusedVoucherCount = getRandomInt(0, 20);

            const eligibleStudentCount = dailyPopulation;
            const absentStudentCount = STUDENT_POPULATION_LIMIT - dailyPopulation;
            const waivedStudentCount = getRandomInt(5, 50);

            const totalAllotted = dailyPopulation * MAX_CREDIT;
            const totalConsumed = totalClaimed * MEAL_COST;
            const totalUnused = totalAllotted - totalConsumed;

            const tadmc = getRandomInt(MEAL_COST - 2, MEAL_COST + 1);
            const cur = parseFloat(((totalConsumed / totalAllotted) * 100).toFixed(2));
            const ocf = getRandomInt(0, 10);

            const reportData = {
                day, month, year, dayOfWeek,
                menu: { dishes: getRandomDishes() },
                stats: {
                    totalClaimed, totalUnclaimed, prePackedCount, customizedCount, unusedVoucherCount,
                    eligibleStudentCount, absentStudentCount, waivedStudentCount
                },
                metrics: { tadmc, cur, ocf },
                financials: {
                    totalConsumedCredits: totalConsumed,
                    totalUnusedCredits: totalUnused,
                    totalAlottedCtredits: totalAllotted
                },
                createdAt: new Date(d),
                updatedAt: new Date(d)
            };

            const exists = await Report.findOne({ day, month, year });
            if (!exists) {
                reports.push(reportData);
            }
        }

        // C. Insert
        if (reports.length > 0) {
            await Report.insertMany(reports);
            console.log(`✅ Success! Generated ${reports.length} new daily reports.`);
            res.status(201).json({
                success: true,
                message: `Generated ${reports.length} reports covering the last ${DAYS_TO_GENERATE} days.`,
                count: reports.length
            });
        } else {
            res.status(200).json({ message: "No new data generated (dates likely already exist)." });
        }

    } catch (error) {
        console.error("❌ MOCK GENERATION ERROR:", error);
        res.status(500).json({ message: error.message });
    }
};

// ==================================================================
// 2️⃣ MOCK STUDENT CLAIM REPORTS (RETURNS JSON DIRECTLY)
// ==================================================================

// Departments Configuration
const DEPARTMENTS = [
    { key: "preschool", years: ["0"], sections: ["Love", "Joy"] },
    { key: "primaryEducation", years: ["1", "2", "3"], sections: ["Faith", "Hope"] },
    { key: "intermediate", years: ["4", "5", "6"], sections: ["Peace", "Patience"] },
    { key: "juniorHighSchool", years: ["7", "8", "9", "10"], sections: ["Kindness", "Goodness"] },
    { key: "seniorHighSchool", years: ["11", "12"], sections: ["STEM A", "ABM B"] },
    { key: "higherEducation", years: ["1", "2", "3", "4"], sections: ["BSIS", "BSBA", "BSSW"] }
];

const firstNames = ["John", "Jane", "Michael", "Emily", "Chris", "Sarah", "David", "Laura"];
const lastNames = ["Doe", "Smith", "Johnson", "Brown", "Williams", "Jones", "Garcia", "Miller"];

// Helper: Generate History
const generateClaimHistory = () => {
    const history = [];
    const today = new Date();

    for (let i = 0; i < DAYS_TO_GENERATE; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);

        if (d.getDay() === 0 || d.getDay() === 6) continue;

        const rand = Math.random();
        let status = "UNCLAIMED";
        let credit = 0;

        if (rand > 0.3) {
            status = "CLAIMED";
            credit = MAX_CREDIT;
        } else if (rand > 0.2) {
            status = "WAIVED";
            credit = 0;
        }

        history.push({
            date: d.toISOString(),
            creditClaimed: credit,
            remarks: [status]
        });
    }
    return history;
};

// Helper: Generate Student
const generateStudent = (sectionName, yearLevel) => {
    const first = firstNames[getRandomInt(0, firstNames.length - 1)];
    const last = lastNames[getRandomInt(0, lastNames.length - 1)];
    
    return {
        name: `${first} ${last}`,
        section: sectionName,
        gradeLevel: yearLevel,
        claimRecords: generateClaimHistory() // 🟢 100 Days of History
    };
};

const getMockStudentClaimReports = (req, res) => {
    try {
        console.log("🚀 Generating Mock Student Claim Reports (JSON)...");
        
        const responseData = DEPARTMENTS.map(dept => {
            const levels = dept.years.map(year => {
                const sections = dept.sections.map(sectionName => {
                    // Generate 5 Students per section
                    const students = Array.from({ length: 5 }, () => 
                        generateStudent(sectionName, year)
                    );

                    return {
                        section: sectionName,
                        studentCount: students.length,
                        adviser: dept.key === "higherEducation" ? "N/A" : `Adviser for ${sectionName}`,
                        students: students
                    };
                });

                return {
                    levelName: year,
                    sections: sections
                };
            });

            return {
                category: dept.key,
                levels: levels
            };
        });

        res.status(200).json(responseData);

    } catch (error) {
        console.error("❌ STUDENT MOCK ERROR:", error);
        res.status(500).json({ message: error.message });
    }
};

// ==================================================================
// EXPORTS
// ==================================================================
export { 
    generateMockReports, 
    getMockStudentClaimReports 
};