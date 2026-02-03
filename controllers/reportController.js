import Student from '../models/student.js';
import ClaimRecord from '../models/claimRecord.js';
import Credit from '../models/credit.js';
import Report from '../models/report.js'
import KPIRange from '../models/kpiRange.js';

import { logAction } from "./systemLoggerController.js"

const getPHDateRange = () => {
    const now = new Date();
    // Force specific timezone handling
    const options = { timeZone: "Asia/Manila", year: 'numeric', month: 'numeric', day: 'numeric' };
    const phDateString = now.toLocaleDateString("en-US", options);
    const [month, day, year] = phDateString.split('/').map(num => parseInt(num));

    const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
    const startOfDayVal = Date.UTC(year, month - 1, day) - PH_OFFSET_MS;

    return {
        start: new Date(startOfDayVal),
        end: new Date(startOfDayVal + (24 * 60 * 60 * 1000) - 1)
    };
};

// =========================================================
// 1. INITIALIZE RECORD (Runs at Start of Day / Submission)
// =========================================================
const initializeTodayRecord = async () => {
    try {
        console.log("🔄 STARTING: Initializing Daily Student Records...");
        const { start, end } = getPHDateRange();

        // Check if we already initialized to avoid duplicates
        const alreadyInitialized = await Student.findOne({
            "claimRecords.date": { $gte: start, $lte: end }
        });

        if (alreadyInitialized) {
            console.log("ℹ️ SKIPPED: Records for today are already initialized.");
            return;
        }

        // Push a default "WAIVED" entry to ALL students
        await Student.updateMany({}, {
            $push: {
                claimRecords: {
                    date: start,
                    creditClaimed: 0,
                    remarks: ["WAIVED"]
                }
            }
        });

        console.log("✅ COMPLETED: All students initialized with WAIVED status for today.");
    } catch (error) {
        console.error("❌ ERROR initializing records:", error);
    }
};

// =========================================================
// 2. FINALIZE RECORD (Runs at End of Day / Remove Credits)
// =========================================================
const finalizeTodayRecord = async () => {
    try {
        console.log("🔄 STARTING: Finalizing Daily Student Records...");

        // A. Fetch Global Credit Value (The Benchmark)
        const creditSetting = await Credit.findOne();
        const maxCredit = creditSetting ? creditSetting.creditValue : 0;

        if (maxCredit === 0) {
            console.log("⚠️ WARNING: Global credit value is 0 or missing.");
        }

        // B. Fetch Today's Claim Record
        const { start, end } = getPHDateRange();
        const dailyRecord = await ClaimRecord.findOne({
            claimDate: { $gte: start, $lte: end }
        });

        if (!dailyRecord) {
            return console.log("⚠️ NO CLAIM RECORD FOUND FOR TODAY. Skipping finalization.");
        }

        // C. Prepare Bulk Operations
        const bulkOps = [];
        const flattenedRecords = [];

        // Flatten all eligible students from all sections into one array
        dailyRecord.claimRecords.forEach(section => {
            if (section.eligibleStudents) {
                flattenedRecords.push(...section.eligibleStudents);
            }
        });

        // D. Build the Logic
        for (const student of flattenedRecords) {
            const remainingBalance = student.creditBalance;
            let finalStatus = "UNCLAIMED";
            let creditUsed = 0;

            // Logic: Did they touch their credits?
            if (remainingBalance < maxCredit) {
                // They spent something
                finalStatus = "CLAIMED";
                creditUsed = maxCredit - remainingBalance;
            } else {
                // Balance is full (or more), they bought nothing
                finalStatus = "UNCLAIMED";
                creditUsed = 0;
            }

            // Add to Bulk Operation Queue
            bulkOps.push({
                updateOne: {
                    filter: {
                        studentID: student.studentID,
                        "claimRecords.date": { $gte: start, $lte: end }
                    },
                    update: {
                        $set: {
                            "claimRecords.$.remarks": [finalStatus],
                            "claimRecords.$.creditClaimed": creditUsed
                        }
                    }
                }
            });
        }

        // E. Execute Bulk Write
        if (bulkOps.length > 0) {
            await Student.bulkWrite(bulkOps);
            console.log(`✅ COMPLETED: Updated records for ${bulkOps.length} eligible students.`);
        } else {
            console.log("ℹ️ No eligible students found to update.");
        }

    } catch (error) {
        console.error("❌ ERROR finalizing records:", error);
    }
};

// --------------------------
// FOR DASHBOARD REPORT
// --------------------------

const initializeDailyReport = async (req, res, next) => {
    try {
        const targetDate = new Date();
        const day = targetDate.getDate();
        const month = targetDate.getMonth() + 1;
        const year = targetDate.getFullYear();
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const dayOfWeek = dayNames[targetDate.getDay()];

        const existingReport = await Report.findOne({ day, month, year });

        if (existingReport) {
            return res.status(409).json({
                message: `Daily Report for ${month}/${day}/${year} already exists.`,
                data: existingReport
            });
        }

        // 🟢 HANDLE DISH INPUT (Flexible)
        let dishesArray = [];
        if (req.body.dish1) dishesArray.push(req.body.dish1);
        if (req.body.dish2) dishesArray.push(req.body.dish2);

        const newReport = new Report({
            day, month, year, dayOfWeek,
            menu: {
                dishes: dishesArray
            }
        });

        await newReport.save();

        const actorID = req.user ? (req.user._id || req.user.userID) : 'SYSTEM';
        const actorName = req.user ? req.user.email : 'Admin';

        await logAction({ id: actorID, type: 'User', name: actorName, role: 'ADMIN' },
            'CREATE_REPORT', 'SUCCESS',
            { description: `Initialized Report for ${month}/${day}/${year}`, referenceID: newReport._id }
        );

        res.status(201).json({
            success: true,
            message: `Report initialized for ${dayOfWeek}`,
            data: newReport
        });

    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: "Daily Report already exists." });
        next(error);
    }
};

const getManilaDateComponents = (dateString) => {
    const targetDate = dateString ? new Date(dateString) : new Date();
    const manilaTimeStr = targetDate.toLocaleString("en-US", { timeZone: "Asia/Manila" });
    const manilaDate = new Date(manilaTimeStr);

    return {
        day: manilaDate.getDate(),
        month: manilaDate.getMonth() + 1,
        year: manilaDate.getFullYear(),
        dayOfWeek: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][manilaDate.getDay()],
        dateObj: manilaDate
    };
};

const initializeDailyReportLogic = async (customDate = null, customDishes = []) => {
    try {
        console.log("🔄 STARTING: Initializing Daily Report...");

        // 1. Get Date Components
        const { day, month, year, dayOfWeek } = getManilaDateComponents(customDate);

        // 2. Check for Duplicate
        const existingReport = await Report.findOne({ day, month, year });
        if (existingReport) {
            console.log(`ℹ️ Report for ${month}/${day}/${year} already exists.`);
            return { success: false, message: "Report already exists", data: existingReport };
        }

        // 3. Create New Report
        const newReport = new Report({
            day, month, year, dayOfWeek,
            menu: { dishes: customDishes }
        });

        await newReport.save();

        await logAction(
            { id: 'SYSTEM', type: 'System', name: 'Scheduler', role: 'SYSTEM' },
            'CREATE_REPORT', 'SUCCESS',
            { description: `Auto-Initialized Report for ${dayOfWeek}, ${month}/${day}/${year}`, referenceID: newReport._id }
        );

        console.log(`✅ Report initialized for ${dayOfWeek}, ${month}/${day}/${year}`);
        return { success: true, message: "Report initialized", data: newReport };

    } catch (error) {
        console.error("❌ Error in initializeDailyReportLogic:", error);
        throw error;
    }
};

const getWeekBounds = (referenceDate) => {
    const d = new Date(referenceDate);
    const dayOfWeek = d.getDay(); // 0 (Sun) to 6 (Sat)

    // Start: Go back to Sunday
    const start = new Date(d);
    start.setDate(d.getDate() - dayOfWeek);
    start.setHours(0, 0, 0, 0);

    // End: Go forward to Saturday
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
};

/**
 * Formats records for the Dashboard JSON structure (Charts, Trends, KPIs)
 */
const formatSectionData = (label, records, kpiSettings) => {
    // 1. Aggregation Variables
    let totalClaimed = 0, totalUnclaimed = 0;
    let prePacked = 0, customized = 0, unused = 0;
    let totalTadmc = 0, totalCur = 0, totalOcf = 0;
    const count = records.length;

    // 2. Summation Loop
    records.forEach(r => {
        totalClaimed += (r.stats?.totalClaimed || 0);
        totalUnclaimed += (r.stats?.totalUnclaimed || 0);
        prePacked += (r.stats?.prePackedCount || 0);
        customized += (r.stats?.customizedCount || 0);
        unused += (r.stats?.unusedVoucherCount || 0);
        totalTadmc += (r.metrics?.tadmc || 0);
        totalCur += (r.metrics?.cur || 0);
        totalOcf += (r.metrics?.ocf || 0);
    });

    // 3. Pick sample for dish names
    const sample = records[0] || {};
    const sampleMenu = sample.menu || {};
    const dishesDisplay = (sampleMenu.dishes && sampleMenu.dishes.length > 0)
        ? sampleMenu.dishes.join(' / ')
        : "N/A";

    // 4. Resolve KPI Ranges
    const ranges = kpiSettings || {
        tadmc: { min: 58, max: 62 },
        cur: { min: 90, max: 100 },
        ocf: { min: 0, max: 15 }
    };

    // 🟢 CRITICAL FIX: Date Formatting to match "January 27, 2026"
    // This ensures your React charts can map the data correctly.
    const dateFormatted = sample.createdAt
        ? new Date(sample.createdAt).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        })
        : "";

    return {
        barChart: {
            dayOfWeek: label,
            date: dateFormatted, // Uses long format now
            dish: dishesDisplay,
            Claimed: totalClaimed,
            Unclaimed: totalUnclaimed
        },
        trends: {
            dataSpan: label,
            "Pre-packed Food": prePacked,
            "Customized Order": customized,
            "Unused vouchers": unused
        },
        tadmc: {
            Day: label,
            AcceptableRange: [ranges.tadmc.min, ranges.tadmc.max],
            TADMC: count ? (totalTadmc / count) : 0
        },
        cur: {
            Day: label,
            AcceptableRange: [ranges.cur.min, ranges.cur.max],
            TADMC: count ? (totalCur / count) : 0
        },
        ocf: {
            Day: label,
            AcceptableRange: [ranges.ocf.min, ranges.ocf.max],
            TADMC: count ? (totalOcf / count) : 0
        }
    };
};

/**
 * Formats records for the Financial Report JSON structure
 */
const formatFinancialData = (label, records) => {
    let allotted = 0, consumed = 0, unused = 0;

    records.forEach(r => {
        allotted += (r.financials?.totalAllottedCredits || 0);
        consumed += (r.financials?.totalConsumedCredits || 0);
        unused += (r.financials?.totalUnusedCredits || 0);
    });

    return {
        label: label,
        date: records[0]?.createdAt ? new Date(records[0].createdAt).toLocaleDateString() : "",
        allotted: allotted,
        consumed: consumed,
        unused: unused
    };
};

// =====================================================================
// 1️⃣ MODULE: DAILY FETCHERS
// =====================================================================
const getDailyData = async (anchorDate, kpiSettings) => {
    // Range: Anchor minus 5 days (Total 6 days including today)
    const startDate = new Date(anchorDate);
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(anchorDate);
    endDate.setHours(23, 59, 59, 999);

    const records = await Report.find({
        createdAt: { $gte: startDate, $lte: endDate }
    }).sort({ createdAt: 1 });

    const result = { bar: [], trends: [], tadmc: [], cur: [], ocf: [], finance: [] };

    records.forEach(r => {
        const dayLabel = new Date(r.createdAt).toLocaleDateString('en-US', { weekday: 'long' });
        const dashData = formatSectionData(dayLabel, [r], kpiSettings);

        result.bar.push(dashData.barChart);
        result.trends.push(dashData.trends);
        result.tadmc.push(dashData.tadmc);
        result.cur.push(dashData.cur);
        result.ocf.push(dashData.ocf);
        result.finance.push(formatFinancialData(dayLabel, [r]));
    });

    return result;
};

// =====================================================================
// 2️⃣ MODULE: WEEKLY FETCHERS
// =====================================================================
const getWeeklyData = async (anchorDate, kpiSettings) => {
    const result = { bar: [], trends: [], tadmc: [], cur: [], ocf: [], finance: [] };

    // 🟢 UPDATED: Loop 5 down to 0 (6 weeks total for better chart visualization)
    for (let i = 6; i >= 0; i--) {
        const refDate = new Date(anchorDate);
        refDate.setDate(refDate.getDate() - (i * 7));
        const { start, end } = getWeekBounds(refDate);

        const records = await Report.find({
            createdAt: { $gte: start, $lte: end }
        });

        const label = i === 0 ? "Current Week" : `${i} Week(s) Ago`;
        const dashData = formatSectionData(label, records, kpiSettings);

        result.bar.push(dashData.barChart);
        result.trends.push(dashData.trends);
        result.tadmc.push(dashData.tadmc);
        result.cur.push(dashData.cur);
        result.ocf.push(dashData.ocf);
        result.finance.push(formatFinancialData(label, records));
    }

    return result;
};

// =====================================================================
// 3️⃣ MODULE: MONTHLY FETCHERS
// =====================================================================
const getMonthlyData = async (anchorDate, kpiSettings) => {
    const result = { bar: [], trends: [], tadmc: [], cur: [], ocf: [], finance: [] };

    // 🟢 UPDATED: Loop 5 down to 0 (6 months total)
    for (let i = 6; i >= 0; i--) {
        const d = new Date(anchorDate);
        d.setMonth(d.getMonth() - i);

        const targetMonth = d.getMonth() + 1;
        const targetYear = d.getFullYear();
        const monthName = d.toLocaleDateString('en-US', { month: 'long' });

        const records = await Report.find({
            month: targetMonth,
            year: targetYear
        });

        const dashData = formatSectionData(monthName, records, kpiSettings);

        result.bar.push(dashData.barChart);
        result.trends.push(dashData.trends);
        result.tadmc.push(dashData.tadmc);
        result.cur.push(dashData.cur);
        result.ocf.push(dashData.ocf);
        result.finance.push(formatFinancialData(monthName, records));
    }

    return result;
};

// =====================================================================
// 4️⃣ MODULE: OVERALL DATA (Rankings & KPI)
// =====================================================================
const getOverallData = async (kpiSettings) => {
    // A. Top 3 Most Claimed
    const topDays = await Report.find()
        .sort({ "stats.totalClaimed": -1 })
        .limit(3)
        .select('createdAt menu stats');

    const mostMealClaims = topDays.map((r, index) => {
        const dishText = (r.menu?.dishes?.length) ? r.menu.dishes.join(' / ') : "N/A";
        return {
            title: ["Most", "Second Most", "Third Most"][index] + " Meal Claims",
            value: dishText,
            subtitle: `${r.stats.totalClaimed} claims on ${new Date(r.createdAt).toLocaleDateString()}`
        };
    });

    // B. Bottom 3 Least Claimed
    const bottomDays = await Report.find({ "stats.totalClaimed": { $gt: 0 } })
        .sort({ "stats.totalClaimed": 1 })
        .limit(3)
        .select('createdAt menu stats');

    const leastMealClaims = bottomDays.map((r, index) => {
        const dishText = (r.menu?.dishes?.length) ? r.menu.dishes.join(' / ') : "N/A";
        return {
            title: ["Least", "Second Least", "Third Least"][index] + " Claimed Combination",
            value: dishText,
            subtitle: `${r.stats.totalClaimed} claims on ${new Date(r.createdAt).toLocaleDateString()}`
        };
    });

    // C. Global Aggregates
    const agg = await Report.aggregate([
        {
            $group: {
                _id: null,
                totalAllotted: { $sum: "$financials.totalAllottedCredits" },
                totalConsumed: { $sum: "$financials.totalConsumedCredits" },
                totalUnused: { $sum: "$financials.totalUnusedCredits" },
                totalClaimedCount: { $sum: "$stats.totalClaimed" },
                totalUnclaimedCount: { $sum: "$stats.totalUnclaimed" },
                avgTadmc: { $avg: "$metrics.tadmc" },
                avgCur: { $avg: "$metrics.cur" },
                avgOcf: { $avg: "$metrics.ocf" }
            }
        }
    ]);
    const data = agg[0] || {};

    const ranges = kpiSettings || {
        tadmc: { min: 58, max: 62 },
        cur: { min: 90, max: 100 },
        ocf: { min: 0, max: 15 }
    };

    const totalAllottedCredits = data.totalUnused + data.totalConsumed;

    return {
        mostMealClaims,
        leastMealClaims,
        claimsCount: [
            { title: "Overall Unclaimed Count", value: data.totalUnclaimedCount || 0, inPercentage: false, subtitle: "Total Unclaimed" },
            { title: "Overall Claim Count", value: data.totalClaimedCount || 0, subtitle: "Total Claimed" }
        ],
        KPIreports: [
            {
                title: "Average OCF",
                value: (data.avgOcf || 0).toFixed(2),
                isPercentage: true,
                subtitle: `Overall (Target: ${ranges.ocf.min}-${ranges.ocf.max}%)`
            },
            {
                title: "Average CUR",
                value: (data.avgCur || 0).toFixed(2),
                isPercentage: true,
                subtitle: `Overall (Target: ${ranges.cur.min}-${ranges.cur.max}%)`
            },
            {
                title: "Average TADMC",
                value: (data.avgTadmc || 0).toFixed(2),
                subtitle: `Overall (Target: ${ranges.tadmc.min}-${ranges.tadmc.max})`
            },
        ],
        consumedCredits: [
            { title: "Total Unused Credits", value: `₱${(data.totalUnused || 0).toLocaleString()}`, subtitle: "Actual unused credits" },
            { title: "Total Consumed Credits", value: `₱${(data.totalConsumed || 0).toLocaleString()}`, subtitle: "Actual consumed credits" },
            { title: "Total Allotted Credits", value: `₱${totalAllottedCredits.toLocaleString()}`, subtitle: "Total budget distributed" }
        ]
    };
};

// =====================================================================
// 🚀 MAIN CONTROLLER 1: DASHBOARD DATA
// =====================================================================
const getDashboardData = async (req, res, next) => {
    try {
        const anchorDate = req.query.date ? new Date(req.query.date) : new Date();
        console.log(`📊 Generating Dashboard for: ${anchorDate.toLocaleDateString()}`);

        const kpiSettings = await KPIRange.findOne();

        const { day, month, year } = getManilaDateComponents(anchorDate.toISOString());

        const currentReport = await Report.findOne({ day, month, year });

        const currentStats = currentReport ? currentReport.stats : {
            totalClaimed: 0, totalUnclaimed: 0,
            prePackedCount: 0, customizedCount: 0, unusedVoucherCount: 0,
            eligibleStudentCount: 0, absentStudentCount: 0, waivedStudentCount: 0
        };

        const currentFinancials = currentReport ? currentReport.financials : {
            totalConsumedCredits: 0, totalUnusedCredits: 0, totalAlottedCtredits: 0
        };

        const [daily, weekly, monthly, overall] = await Promise.all([
            getDailyData(anchorDate, kpiSettings),
            getWeeklyData(anchorDate, kpiSettings),
            getMonthlyData(anchorDate, kpiSettings),
            getOverallData(kpiSettings)
        ]);

        res.status(200).json({
            today: [
                { barChartData: daily.bar },
                { trendsData: daily.trends },
                { TADMCdata: daily.tadmc },
                { CURdata: daily.cur },
                { OCFdata: daily.ocf }
            ],
            weekly: [
                { barChartData: weekly.bar },
                { trendsData: weekly.trends },
                { TADMCdata: weekly.tadmc },
                { CURdata: weekly.cur },
                { OCFdata: weekly.ocf }
            ],
            monthly: [
                { barChartData: monthly.bar },
                { trendsData: monthly.trends },
                { TADMCdata: monthly.tadmc },
                { CURdata: monthly.cur },
                { OCFdata: monthly.ocf }
            ],
            overall: overall,
            stats: currentStats,
            financials: currentFinancials
        });

    } catch (error) {
        next(error);
    }
};

// =====================================================================
// 🚀 MAIN CONTROLLER 2: FINANCIAL REPORT
// =====================================================================
const getFinancialReport = async (req, res, next) => {
    try {
        const anchorDate = req.query.date ? new Date(req.query.date) : new Date();
        console.log(`💰 Generating Financial Report for: ${anchorDate.toLocaleDateString()}`);

        const [daily, weekly, monthly] = await Promise.all([
            getDailyData(anchorDate),
            getWeeklyData(anchorDate),
            getMonthlyData(anchorDate)
        ]);

        res.status(200).json({
            daily: daily.finance,
            weekly: weekly.finance,
            monthly: monthly.finance
        });

    } catch (error) {
        next(error);
    }
};

const getTargetDate = (dateString) => {
    const targetDate = dateString ? new Date(dateString) : new Date();
    return {
        day: targetDate.getDate(),
        month: targetDate.getMonth() + 1,
        year: targetDate.getFullYear(),
        formatted: targetDate.toLocaleDateString()
    };
};

const addDishes = async (req, res, next) => {
    try {
        const { dishes, date } = req.body;

        // 1. Validation
        if (!dishes || !Array.isArray(dishes) || dishes.length === 0) {
            return res.status(400).json({ message: "Please provide an array of dishes (strings)." });
        }

        // 2. Date Calculation
        // We need the date object to calculate 'dayOfWeek' in case we need to create a new record
        const dateObj = date ? new Date(date) : new Date();
        const { day, month, year, formatted } = getTargetDate(date);

        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const dayOfWeek = dayNames[dateObj.getDay()];

        // 3. Upsert Operation (Update if exists, Insert if new)
        const updatedReport = await Report.findOneAndUpdate(
            { day, month, year }, // Search criteria
            {
                // A. Always add the new dishes (preventing duplicates in the array)
                $addToSet: { "menu.dishes": { $each: dishes } },

                // B. ONLY set these fields if we are inserting a NEW document
                $setOnInsert: {
                    dayOfWeek: dayOfWeek,
                    stats: {
                        totalClaimed: 0,
                        totalUnclaimed: 0,
                        prePackedCount: 0,
                        customizedCount: 0,
                        unusedVoucherCount: 0,
                        eligibleStudentCount: 0,
                        absentStudentCount: 0,
                        waivedStudentCount: 0
                    },
                    financials: {
                        totalConsumedCredits: 0,
                        totalUnusedCredits: 0,
                        totalAlottedCtredits: 0
                    }
                }
            },
            {
                new: true,    // Return the modified document
                upsert: true, // 🟢 Create the document if it doesn't exist
                setDefaultsOnInsert: true
            }
        );

        // 4. Log Action
        const actorID = req.user ? (req.user._id || req.user.userID) : 'SYSTEM';
        const actorName = req.user ? req.user.email : 'Admin';

        // Determine if it was created or updated for the log message
        // (If it was just created, the array length equals the input length)
        const actionType = updatedReport.menu.dishes.length === dishes.length ? 'CREATE_AND_UPDATE_MENU' : 'UPDATE_MENU';

        await logAction(
            { id: actorID, type: 'User', name: actorName, role: 'ADMIN' },
            actionType,
            'SUCCESS',
            { description: `Added dishes: ${dishes.join(', ')} to ${formatted}`, referenceID: updatedReport._id }
        );

        res.status(200).json({
            message: "Menu updated successfully.",
            data: updatedReport.menu.dishes
        });

    } catch (error) {
        next(error);
    }
};

const viewDishes = async (req, res, next) => {
    try {
        const { day, month, year, formatted } = getTargetDate(req.query.date);

        const report = await Report.findOne({ day, month, year }).select('menu dayOfWeek');

        if (!report) {
            return res.status(404).json({ message: `No report found for ${formatted}.` });
        }

        res.status(200).json({
            date: formatted,
            dayOfWeek: report.dayOfWeek,
            dishes: report.menu.dishes || []
        });

    } catch (error) {
        next(error);
    }
};


export {
    initializeTodayRecord,
    finalizeTodayRecord,

    initializeDailyReport,
    initializeDailyReportLogic,

    addDishes,
    viewDishes,

    getDashboardData,
    getFinancialReport
};