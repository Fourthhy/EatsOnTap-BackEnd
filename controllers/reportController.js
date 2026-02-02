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
        // We check if any student already has a record for this exact date range
        const alreadyInitialized = await Student.findOne({
            "claimRecords.date": { $gte: start, $lte: end }
        });

        if (alreadyInitialized) {
            console.log("ℹ️ SKIPPED: Records for today are already initialized.");
            return;
        }

        // Push a default "WAIVED" entry to ALL students
        // Using the 'start' date ensures the timestamp is uniform (00:00 PH Time)
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
            // Since maxCredit is constant for the day, this check is safe.
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
            // Update the SPECIFIC history item for today
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
        const targetDate = req.body.date ? new Date(req.body.date) : new Date();
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
        // 1. Check if 'dishes' array is sent
        let dishesArray = req.body.dishes || [];

        // 2. Fallback: If old 'dish1/dish2' format is sent, convert to array
        if (req.body.dish1) dishesArray.push(req.body.dish1);
        if (req.body.dish2) dishesArray.push(req.body.dish2);

        const newReport = new Report({
            day, month, year, dayOfWeek,
            menu: {
                dishes: dishesArray // Saves as ["Adobo", "Sinigang", ...]
            }
        });

        await newReport.save();

        // ... existing logging logic ...
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

    // 3. Pick sample for dish names (mainly for Daily view)
    const sample = records[0] || {};
    const sampleMenu = sample.menu || {};

    // 🟢 UPDATED: Join dishes array into a single string "Dish A / Dish B / Dish C"
    const dishesDisplay = (sampleMenu.dishes && sampleMenu.dishes.length > 0)
        ? sampleMenu.dishes.join(' / ')
        : "N/A";

    // 4. Resolve KPI Ranges (Use Defaults if settings are missing)
    const ranges = kpiSettings || {
        tadmc: { min: 58, max: 62 },
        cur: { min: 90, max: 100 },
        ocf: { min: 0, max: 15 }
    };

    return {
        barChart: {
            dayOfWeek: label,
            date: sample.createdAt ? new Date(sample.createdAt).toLocaleDateString() : "",
            dish: dishesDisplay, // 🟢 New field name (singular 'dish' containing the string)
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
    startDate.setDate(startDate.getDate() - 5);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(anchorDate);
    endDate.setHours(23, 59, 59, 999);

    const records = await Report.find({
        createdAt: { $gte: startDate, $lte: endDate }
    }).sort({ createdAt: 1 });

    // Output Containers
    const result = { bar: [], trends: [], tadmc: [], cur: [], ocf: [], finance: [] };

    records.forEach(r => {
        const dayLabel = new Date(r.createdAt).toLocaleDateString('en-US', { weekday: 'long' });

        // 🟢 Pass kpiSettings to the formatter
        const dashData = formatSectionData(dayLabel, [r], kpiSettings);

        result.bar.push(dashData.barChart);
        result.trends.push(dashData.trends);
        result.tadmc.push(dashData.tadmc);
        result.cur.push(dashData.cur);
        result.ocf.push(dashData.ocf);

        // Financial Data (No KPI ranges needed here)
        result.finance.push(formatFinancialData(dayLabel, [r]));
    });

    return result;
};

// =====================================================================
// 2️⃣ MODULE: WEEKLY FETCHERS
// =====================================================================
const getWeeklyData = async (anchorDate, kpiSettings) => {
    const result = { bar: [], trends: [], tadmc: [], cur: [], ocf: [], finance: [] };

    // Loop 3 down to 0 (3 weeks ago -> Current Week)
    for (let i = 3; i >= 0; i--) {
        // "Hop" logic: Go back i weeks
        const refDate = new Date(anchorDate);
        refDate.setDate(refDate.getDate() - (i * 7));
        const { start, end } = getWeekBounds(refDate);

        const records = await Report.find({
            createdAt: { $gte: start, $lte: end }
        });

        const label = i === 0 ? "Current Week" : `${i} Week(s) Ago`;

        // 1. Dashboard Data
        // 🟢 Pass kpiSettings to the formatter
        const dashData = formatSectionData(label, records, kpiSettings);

        result.bar.push(dashData.barChart);
        result.trends.push(dashData.trends);
        result.tadmc.push(dashData.tadmc);
        result.cur.push(dashData.cur);
        result.ocf.push(dashData.ocf);

        // 2. Financial Data
        result.finance.push(formatFinancialData(label, records));
    }

    return result;
};

// =====================================================================
// 3️⃣ MODULE: MONTHLY FETCHERS
// =====================================================================
const getMonthlyData = async (anchorDate, kpiSettings) => {
    const result = { bar: [], trends: [], tadmc: [], cur: [], ocf: [], finance: [] };

    for (let i = 3; i >= 0; i--) {
        const d = new Date(anchorDate);
        d.setMonth(d.getMonth() - i);

        const targetMonth = d.getMonth() + 1; // 1-12
        const targetYear = d.getFullYear();
        const monthName = d.toLocaleDateString('en-US', { month: 'long' });

        // Query by specific month/year fields
        const records = await Report.find({
            month: targetMonth,
            year: targetYear
        });

        // 1. Dashboard Data
        // 🟢 Pass kpiSettings to the formatter
        const dashData = formatSectionData(monthName, records, kpiSettings);

        result.bar.push(dashData.barChart);
        result.trends.push(dashData.trends);
        result.tadmc.push(dashData.tadmc);
        result.cur.push(dashData.cur);
        result.ocf.push(dashData.ocf);

        // 2. Financial Data
        result.finance.push(formatFinancialData(monthName, records));
    }

    return result;
};

// =====================================================================
// 4️⃣ MODULE: OVERALL DATA (Rankings & KPI)
// =====================================================================
const getOverallData = async (kpiSettings) => {
    // A. Top 3 Most Claimed (Highest Traffic Days)
    const topDays = await Report.find()
        .sort({ "stats.totalClaimed": -1 })
        .limit(3)
        .select('createdAt menu stats');

    const mostMealClaims = topDays.map((r, index) => {
        // 🟢 UPDATED: Join dishes array
        const dishText = (r.menu?.dishes?.length) ? r.menu.dishes.join(' / ') : "N/A";

        return {
            title: ["Most", "Second Most", "Third Most"][index] + " Meal Claims",
            value: dishText,
            subtitle: `${r.stats.totalClaimed} claims on ${new Date(r.createdAt).toLocaleDateString()}`
        };
    });

    // B. Bottom 3 Least Claimed (Lowest Traffic, excluding 0)
    const bottomDays = await Report.find({ "stats.totalClaimed": { $gt: 0 } })
        .sort({ "stats.totalClaimed": 1 })
        .limit(3)
        .select('createdAt menu stats');

    const leastMealClaims = bottomDays.map((r, index) => {
        // 🟢 UPDATED: Join dishes array
        const dishText = (r.menu?.dishes?.length) ? r.menu.dishes.join(' / ') : "N/A";

        return {
            title: ["Least", "Second Least", "Third Least"][index] + " Claimed Combination",
            value: dishText,
            subtitle: `${r.stats.totalClaimed} claims on ${new Date(r.createdAt).toLocaleDateString()}`
        };
    });

    // C. Global Aggregates (Sum of everything)
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

    // Use default ranges if settings are missing
    const ranges = kpiSettings || {
        tadmc: { min: 58, max: 62 },
        cur: { min: 90, max: 100 },
        ocf: { min: 0, max: 15 }
    };

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
            { title: "Total Allotted Credits", value: `₱${(data.totalAllotted || 0).toLocaleString()}`, subtitle: "Total budget distributed" }
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

        // 1. Fetch Dynamic KPI Settings
        // We fetch this ONCE and pass it down to ensure all charts use the same targets
        const kpiSettings = await KPIRange.findOne();

        // 2. Fetch all modules independently (Injecting kpiSettings)
        const [daily, weekly, monthly, overall] = await Promise.all([
            getDailyData(anchorDate, kpiSettings),
            getWeeklyData(anchorDate, kpiSettings),
            getMonthlyData(anchorDate, kpiSettings),
            getOverallData(kpiSettings)
        ]);

        // 3. Construct Final JSON Structure
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
            overall: overall
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

        // We can reuse the same fetching logic but extract only the 'finance' part
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

        const { day, month, year, formatted } = getTargetDate(date);

        // 2. Find and Update
        // We use $addToSet to prevent duplicate dishes (e.g., adding "Adobo" twice)
        const updatedReport = await Report.findOneAndUpdate(
            { day, month, year },
            { $addToSet: { "menu.dishes": { $each: dishes } } }, 
            { new: true } // Return the updated document
        );

        if (!updatedReport) {
            return res.status(404).json({ message: `No report found for ${formatted}. Please initialize the report first.` });
        }

        // 3. Log Action
        const actorID = req.user ? (req.user._id || req.user.userID) : 'SYSTEM';
        const actorName = req.user ? req.user.email : 'Admin';
        
        await logAction(
            { id: actorID, type: 'User', name: actorName, role: 'ADMIN' },
            'UPDATE_MENU', 
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
        // Accepts date from Query string: ?date=2024-03-25
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

    initializeDailyReport, //called at the heartbeat

    addDishes,
    viewDishes,

    getDashboardData,
    getFinancialReport
};