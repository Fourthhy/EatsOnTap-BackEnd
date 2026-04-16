import Student from '../models/student.js';
import ExcelJS from "exceljs"
import ClaimRecord from '../models/claimRecord.js';
import Credit from '../models/credit.js';
import Report from '../models/report.js'
import KPIRange from '../models/kpiRange.js';
import MonthlyReport from '../models/monthlyReport.js';
import moment from "moment-timezone"

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
// 🟢 NEW HELPER: Standardized Bucket Date Generator
// =========================================================
const getBucketDateInfo = (dateString = null) => {
    const targetDate = dateString ? new Date(dateString) : new Date();
    const manilaTimeStr = targetDate.toLocaleString("en-US", { timeZone: "Asia/Manila" });
    const manilaDate = new Date(manilaTimeStr);

    const year = manilaDate.getFullYear();
    const monthNum = String(manilaDate.getMonth() + 1).padStart(2, '0');

    // Bucket Format: "YYYY-MM"
    const bucketMonth = `${year}-${monthNum}`;

    // Academic Year Logic (Assuming August start, adjust if needed)
    const acadYearStart = manilaDate.getMonth() >= 7 ? year : year - 1;
    const academicYear = `${acadYearStart}-${acadYearStart + 1}`;

    // Clean UTC date at midnight for exact array matching
    const cleanDate = new Date(Date.UTC(year, manilaDate.getMonth(), manilaDate.getDate()));

    return {
        bucketMonth,
        academicYear,
        cleanDate,
        dayOfWeek: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][manilaDate.getDay()]
    };
};

// =========================================================
// 1. INITIALIZE RECORD (Runs at Start of Day / Submission)
// =========================================================
const initializeDailyStudentRecord = async () => {
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
        const creditSetting = await Credit.findOne();
        const maxCredit = creditSetting ? creditSetting.creditValue : 0;

        // ... (fetch dailyRecord and flatten records exactly as you have it) ...

        const bulkOps = [];

        // 🟢 NEW: Trackers for the Monthly Report
        let todayClaimed = 0;
        let todayUnclaimed = 0;
        let todayUsedCredits = 0;
        let todayAllottedCredits = flattenedRecords.length * maxCredit;

        // D. Build the Logic
        for (const student of flattenedRecords) {
            const remainingBalance = student.creditBalance;
            let finalStatus = "UNCLAIMED";
            let creditUsed = 0;

            if (remainingBalance < maxCredit) {
                finalStatus = "CLAIMED";
                creditUsed = maxCredit - remainingBalance;

                // 🟢 NEW: Track Claimed
                todayClaimed++;
                todayUsedCredits += creditUsed;
            } else {
                finalStatus = "UNCLAIMED";
                creditUsed = 0;

                // 🟢 NEW: Track Unclaimed
                todayUnclaimed++;
            }

            bulkOps.push({
                updateOne: {
                    filter: { studentID: student.studentID },
                    update: {
                        $set: {
                            // Reset them for tomorrow
                            temporaryClaimStatus: "INELIGIBLE",
                            temporaryCreditBalance: 0
                        }
                    }
                }
            });
        }

        // E. Execute Bulk Write for Students
        if (bulkOps.length > 0) {
            await Student.bulkWrite(bulkOps);
            console.log(`✅ COMPLETED: Updated records for ${bulkOps.length} eligible students.`);

            // 🟢 NEW: Now update the MonthlyReport Bucket!
            const { bucketMonth, cleanDate } = getBucketDateInfo(start);
            let monthlyReport = await MonthlyReport.findOne({ bucketMonth });

            if (monthlyReport) {
                let dailyReport = monthlyReport.dailyReports.find(dr => dr.date.getTime() === cleanDate.getTime());

                if (dailyReport) {
                    // 1. Update today's specific stats
                    dailyReport.statistics.totalEligible = flattenedRecords.length;
                    dailyReport.statistics.totalClaimed = todayClaimed;
                    dailyReport.statistics.totalUnclaimed = todayUnclaimed;
                    dailyReport.financials.totalAllottedCredits = todayAllottedCredits;
                    dailyReport.financials.totalUsedCredits = todayUsedCredits;
                    dailyReport.financials.totalUnusedCredits = todayAllottedCredits - todayUsedCredits;

                    // 2. Recalculate the Root Bucket Totals (Only sum cumulative transactions)
                    let totalMonthlyClaimed = 0;
                    let totalMonthlyUnclaimed = 0;
                    let totalMonthlyUsed = 0;
                    let totalMonthlyUnused = 0;

                    monthlyReport.dailyReports.forEach(dr => {
                        totalMonthlyClaimed += dr.statistics.totalClaimed;
                        totalMonthlyUnclaimed += dr.statistics.totalUnclaimed;
                        totalMonthlyUsed += dr.financials.totalUsedCredits;
                        totalMonthlyUnused += dr.financials.totalUnusedCredits;
                    });

                    // 3. Map cumulative totals
                    monthlyReport.statistics.totalClaimed = totalMonthlyClaimed;
                    monthlyReport.statistics.totalUnclaimed = totalMonthlyUnclaimed;
                    monthlyReport.financials.totalUsedCredits = totalMonthlyUsed;
                    monthlyReport.financials.totalUnusedCredits = totalMonthlyUnused;

                    // 4. 🟢 THE FIX: Static metrics just take the latest day's known value
                    monthlyReport.statistics.totalEligible = dailyReport.statistics.totalEligible;
                    monthlyReport.financials.totalAllottedCredits = dailyReport.financials.totalAllottedCredits;

                    await monthlyReport.save();
                    console.log(`✅ COMPLETED: Updated MonthlyReport bucket for ${cleanDate.toLocaleDateString()}`);
                }
            }
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

// =====================================================================
// 🟢 REFACTORED: initializeDailyReport (Unified & Bucket-Ready)
// =====================================================================
const initializeDailyReport = async (req, res, next) => {
    try {
        const targetDate = req.body.date ? new Date(req.body.date) : new Date();
        const { bucketMonth, academicYear, cleanDate, dayOfWeek } = getBucketDateInfo(targetDate);

        let monthlyReport = await MonthlyReport.findOne({ bucketMonth });
        if (!monthlyReport) {
            // 🟢 FIX: Initialize the root-level required schemas
            monthlyReport = new MonthlyReport({
                bucketMonth,
                academicYear,
                dailyReports: [],
                statistics: { totalEligible: 0, totalSnacksClaimed: 0, totalMealsClaimed: 0, totalClaimed: 0, totalUnclaimed: 0, totalWaived: 0, totalAbsences: 0 },
                financials: { totalAllottedCredits: 0, totalUsedCredits: 0, totalUnusedCredits: 0, totalOnHandCash: 0 }
            });
        }

        const dayExists = monthlyReport.dailyReports.some(dr => dr.date.getTime() === cleanDate.getTime());

        if (dayExists) {
            return res.status(409).json({
                success: false,
                message: `Daily Report for ${cleanDate.toLocaleDateString()} already exists.`,
                data: monthlyReport
            });
        }

        let dishesArray = [];
        if (req.body.dish1) dishesArray.push(req.body.dish1);
        if (req.body.dish2) dishesArray.push(req.body.dish2);

        monthlyReport.dailyReports.push({
            date: cleanDate,
            dayOfWeek: dayOfWeek,
            menu: dishesArray,
            metrics: { tadmc: 0, cur: 0, ocf: 0 },
            statistics: { totalEligible: 0, totalSnacksClaimed: 0, totalMealsClaimed: 0, totalClaimed: 0, totalUnclaimed: 0, totalWaived: 0, totalAbsences: 0 },
            financials: { totalAllottedCredits: 0, totalUsedCredits: 0, totalUnusedCredits: 0, totalOnHandCash: 0 }
        });

        await monthlyReport.save();

        const actorID = req.user ? (req.user._id || req.user.userID) : 'SYSTEM';
        const actorName = req.user ? req.user.email : 'Admin';

        await logAction({ id: actorID, type: 'User', name: actorName, role: 'ADMIN' },
            'CREATE_REPORT', 'SUCCESS',
            { description: `Initialized Report for ${cleanDate.toLocaleDateString()}`, referenceID: monthlyReport._id }
        );

        res.status(201).json({
            success: true,
            message: `Report initialized for ${dayOfWeek}`,
            data: monthlyReport
        });

    } catch (error) {
        next(error);
    }
};

// =====================================================================
// 🟢 REFACTORED: initializeDailyReportLogic 
// =====================================================================
const initializeDailyReportLogic = async (customDate = null, customDishes = []) => {
    try {
        console.log("🔄 STARTING: Initializing Daily Report into Monthly Bucket...");

        const { bucketMonth, academicYear, cleanDate, dayOfWeek } = getBucketDateInfo(customDate);

        let monthlyReport = await MonthlyReport.findOne({ bucketMonth });
        if (!monthlyReport) {
            console.log(`🆕 Creating new Monthly Bucket for ${bucketMonth}...`);
            monthlyReport = new MonthlyReport({ bucketMonth, academicYear, dailyReports: [] });
        }

        // Check if the day is already in the array
        const dayExists = monthlyReport.dailyReports.some(dr => dr.date.getTime() === cleanDate.getTime());

        if (dayExists) {
            console.log(`ℹ️ Report for ${cleanDate.toLocaleDateString()} already exists in bucket.`);
            return { success: false, message: "Report already exists", data: monthlyReport };
        }

        // Push the new day
        monthlyReport.dailyReports.push({
            date: cleanDate,
            dayOfWeek: dayOfWeek,
            menu: customDishes,
            metrics: { tadmc: 0, cur: 0, ocf: 0 },
            statistics: { totalEligible: 0, totalSnacksClaimed: 0, totalMealsClaimed: 0, totalClaimed: 0, totalUnclaimed: 0, totalWaived: 0, totalAbsences: 0 },
            financials: { totalAllottedCredits: 0, totalUsedCredits: 0, totalUnusedCredits: 0, totalOnHandCash: 0 }
        });

        await monthlyReport.save();

        await logAction(
            { id: 'SYSTEM', type: 'System', name: 'Scheduler', role: 'SYSTEM' },
            'CREATE_REPORT', 'SUCCESS',
            { description: `Auto-Initialized Report for ${dayOfWeek}, ${cleanDate.toLocaleDateString()}`, referenceID: monthlyReport._id }
        );

        console.log(`✅ Report initialized for ${dayOfWeek}, ${cleanDate.toLocaleDateString()}`);
        return { success: true, message: "Report initialized", data: monthlyReport };

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

// =====================================================================
// 🟢 REFACTORED: FORMATTERS
// =====================================================================

const formatSectionData = (label, dailyRecords, kpiSettings) => {
    let totalClaimed = 0, totalUnclaimed = 0;
    let snacks = 0, meals = 0, unused = 0;
    let totalTadmc = 0, totalCur = 0, totalOcf = 0;
    const count = dailyRecords.length;

    dailyRecords.forEach(r => {
        // Map to new 'statistics' subdocument
        totalClaimed += (r.statistics?.totalClaimed || 0);
        totalUnclaimed += (r.statistics?.totalUnclaimed || 0);

        // Map new schema fields to frontend expectations
        snacks += (r.statistics?.totalSnacksClaimed || 0);   // Replaces prePacked
        meals += (r.statistics?.totalMealsClaimed || 0);     // Replaces customized
        unused += (r.financials?.totalUnusedCredits || 0);   // Mapping unused credits to unused 

        // Map to new 'metrics' subdocument
        totalTadmc += (r.metrics?.tadmc || 0);
        totalCur += (r.metrics?.cur || 0);
        totalOcf += (r.metrics?.ocf || 0);
    });

    const sample = dailyRecords[0] || {};
    const dishesDisplay = (sample.menu && sample.menu.length > 0) ? sample.menu.join(' / ') : "N/A";

    const ranges = kpiSettings || {
        tadmc: { min: 58, max: 62 }, cur: { min: 90, max: 100 }, ocf: { min: 0, max: 15 }
    };

    const dateFormatted = sample.date
        ? new Date(sample.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : "";

    return {
        barChart: {
            dayOfWeek: label, date: dateFormatted, dish: dishesDisplay,
            Claimed: totalClaimed, Unclaimed: totalUnclaimed
        },
        trends: {
            dataSpan: label,
            "Pre-packed Food": snacks,
            "Customized Order": meals,
            "Unused vouchers": unused
        },
        tadmc: { Day: label, AcceptableRange: [ranges.tadmc.min, ranges.tadmc.max], TADMC: count ? (totalTadmc / count) : 0 },
        cur: { Day: label, AcceptableRange: [ranges.cur.min, ranges.cur.max], TADMC: count ? (totalCur / count) : 0 },
        ocf: { Day: label, AcceptableRange: [ranges.ocf.min, ranges.ocf.max], TADMC: count ? (totalOcf / count) : 0 }
    };
};

const formatFinancialData = (label, dailyRecords) => {
    let allotted = 0, consumed = 0, unused = 0;

    dailyRecords.forEach(r => {
        allotted += (r.financials?.totalAllottedCredits || 0);
        consumed += (r.financials?.totalUsedCredits || 0); // Note: updated to totalUsedCredits
        unused += (r.financials?.totalUnusedCredits || 0);
    });

    return {
        label: label,
        date: dailyRecords[0]?.date ? new Date(dailyRecords[0].date).toLocaleDateString() : "",
        allotted: allotted, consumed: consumed, unused: unused
    };
};

// =====================================================================
// 🟢 REFACTORED: DAILY & WEEKLY FETCHERS
// =====================================================================

// Helper pipeline to extract daily records within a date range
const getDailyRecordsInRange = async (startDate, endDate) => {
    return await MonthlyReport.aggregate([
        { $unwind: "$dailyReports" },
        { $match: { "dailyReports.date": { $gte: startDate, $lte: endDate } } },
        { $sort: { "dailyReports.date": 1 } },
        { $replaceRoot: { newRoot: "$dailyReports" } } // Flattens it so it looks exactly like the old daily Report schema
    ]);
};

const getDailyData = async (anchorDate, kpiSettings) => {
    const startDate = new Date(anchorDate);
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(anchorDate);
    endDate.setHours(23, 59, 59, 999);

    const records = await getDailyRecordsInRange(startDate, endDate);
    const result = { bar: [], trends: [], tadmc: [], cur: [], ocf: [], finance: [] };

    records.forEach(r => {
        const dayLabel = new Date(r.date).toLocaleDateString('en-US', { weekday: 'long' });
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

const getWeeklyData = async (anchorDate, kpiSettings) => {
    const result = { bar: [], trends: [], tadmc: [], cur: [], ocf: [], finance: [] };

    for (let i = 6; i >= 0; i--) {
        const refDate = new Date(anchorDate);
        refDate.setDate(refDate.getDate() - (i * 7));
        const { start, end } = getWeekBounds(refDate);

        const records = await getDailyRecordsInRange(start, end);

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
// 3️⃣ MODULE: MONTHLY FETCHERS (Refactored for MonthlyReport Schema)
// =====================================================================
const getMonthlyData = async (anchorDate, kpiSettings) => {
    const result = { bar: [], trends: [], tadmc: [], cur: [], ocf: [], finance: [] };

    const ranges = kpiSettings || {
        tadmc: { min: 58, max: 62 },
        cur: { min: 90, max: 100 },
        ocf: { min: 0, max: 15 }
    };

    // 1. Generate the last 6 months "YYYY-MM" buckets
    const monthsInfo = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(anchorDate);
        d.setMonth(d.getMonth() - i);

        // Pad month with 0 (e.g., "03" for March)
        const monthNum = String(d.getMonth() + 1).padStart(2, '0');
        const bucketMonth = `${d.getFullYear()}-${monthNum}`;
        const label = d.toLocaleDateString('en-US', { month: 'long' });

        monthsInfo.push({ bucketMonth, label, year: d.getFullYear() });
    }

    // 2. Fetch all 6 months in ONE single query!
    const bucketNames = monthsInfo.map(m => m.bucketMonth);
    const reports = await MonthlyReport.find({ bucketMonth: { $in: bucketNames } });

    // 3. Map the data to the expected Frontend format
    monthsInfo.forEach(info => {
        // Find the report for this specific month (if it exists)
        const report = reports.find(r => r.bucketMonth === info.bucketMonth);

        // Fallback structures if the month has no data yet
        let claimed = 0, unclaimed = 0;
        let snacks = 0, meals = 0, unused = 0;
        let allotted = 0, consumed = 0, unusedCredits = 0;
        let tadmcVal = 0, curVal = 0, ocfVal = 0;

        if (report) {
            const stats = report.statistics;
            const fins = report.financials;

            claimed = stats.totalClaimed || 0;
            unclaimed = stats.totalUnclaimed || 0;

            // Map new schema fields to the old frontend 'trends' labels
            snacks = stats.totalSnacksClaimed || 0;
            meals = stats.totalMealsClaimed || 0;
            unused = fins.totalUnusedCredits || 0;

            allotted = fins.totalAllottedCredits || 0;
            consumed = fins.totalUsedCredits || 0;
            unusedCredits = fins.totalUnusedCredits || 0;

            // Calculate Monthly Averages from the dailyReports array
            if (report.dailyReports && report.dailyReports.length > 0) {
                let t = 0, c = 0, o = 0;
                report.dailyReports.forEach(dr => {
                    t += dr.metrics?.tadmc || 0;
                    c += dr.metrics?.cur || 0;
                    o += dr.metrics?.ocf || 0;
                });
                const count = report.dailyReports.length;
                tadmcVal = t / count;
                curVal = c / count;
                ocfVal = o / count;
            }
        }

        const dateStr = `${info.label} ${info.year}`;

        result.bar.push({
            dayOfWeek: info.label, date: dateStr, dish: "Monthly Aggregated", Claimed: claimed, Unclaimed: unclaimed
        });
        result.trends.push({
            dataSpan: info.label, "Pre-packed Food": snacks, "Customized Order": meals, "Unused vouchers": unused
        });

        // Note: The UI maps 'TADMC' as the value key for all three charts, so we keep that mapping
        result.tadmc.push({ Day: info.label, AcceptableRange: [ranges.tadmc.min, ranges.tadmc.max], TADMC: tadmcVal });
        result.cur.push({ Day: info.label, AcceptableRange: [ranges.cur.min, ranges.cur.max], TADMC: curVal });
        result.ocf.push({ Day: info.label, AcceptableRange: [ranges.ocf.min, ranges.ocf.max], TADMC: ocfVal });

        result.finance.push({
            label: info.label, date: dateStr, allotted, consumed, unused: unusedCredits
        });
    });

    return result;
};

// =====================================================================
// 4️⃣ MODULE: OVERALL DATA (Rankings & KPI) - Refactored
// =====================================================================
const getOverallData = async (kpiSettings) => {

    // Setup Pipeline to extract daily records out of the monthly buckets
    const unwindPipeline = [
        { $unwind: "$dailyReports" },
        {
            $project: {
                date: "$dailyReports.date",
                menu: "$dailyReports.menu",
                totalClaimed: "$dailyReports.statistics.totalClaimed"
            }
        }
    ];

    // A. Top 3 Most Claimed Days
    const topDays = await MonthlyReport.aggregate([
        ...unwindPipeline,
        { $sort: { totalClaimed: -1 } },
        { $limit: 3 }
    ]);

    const mostMealClaims = topDays.map((r, index) => {
        const dishText = (r.menu && r.menu.length) ? r.menu.join(' / ') : "N/A";
        return {
            title: ["Most", "Second Most", "Third Most"][index] + " Meal Claims",
            value: dishText,
            subtitle: `${r.totalClaimed} claims on ${new Date(r.date).toLocaleDateString()}`
        };
    });

    // B. Bottom 3 Least Claimed Days
    const bottomDays = await MonthlyReport.aggregate([
        ...unwindPipeline,
        { $match: { totalClaimed: { $gt: 0 } } },
        { $sort: { totalClaimed: 1 } },
        { $limit: 3 }
    ]);

    const leastMealClaims = bottomDays.map((r, index) => {
        const dishText = (r.menu && r.menu.length) ? r.menu.join(' / ') : "N/A";
        return {
            title: ["Least", "Second Least", "Third Least"][index] + " Claimed Combination",
            value: dishText,
            subtitle: `${r.totalClaimed} claims on ${new Date(r.date).toLocaleDateString()}`
        };
    });

    // C. Global Aggregates (Summing the top-level Monthly stats is incredibly fast)
    const globalAgg = await MonthlyReport.aggregate([
        {
            $group: {
                _id: null,
                totalAllotted: { $sum: "$financials.totalAllottedCredits" },
                totalConsumed: { $sum: "$financials.totalUsedCredits" },
                totalUnused: { $sum: "$financials.totalUnusedCredits" },
                totalClaimedCount: { $sum: "$statistics.totalClaimed" },
                totalUnclaimedCount: { $sum: "$statistics.totalUnclaimed" }
            }
        }
    ]);

    // D. Global Metric Averages (We unwind just the metrics to get true historical averages)
    const metricsAgg = await MonthlyReport.aggregate([
        { $unwind: "$dailyReports" },
        {
            $group: {
                _id: null,
                avgTadmc: { $avg: "$dailyReports.metrics.tadmc" },
                avgCur: { $avg: "$dailyReports.metrics.cur" },
                avgOcf: { $avg: "$dailyReports.metrics.ocf" }
            }
        }
    ]);

    const data = globalAgg[0] || {};
    const metricsData = metricsAgg[0] || {};

    const ranges = kpiSettings || {
        tadmc: { min: 58, max: 62 },
        cur: { min: 90, max: 100 },
        ocf: { min: 0, max: 15 }
    };

    const totalAllottedCredits = (data.totalUnused || 0) + (data.totalConsumed || 0);

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
                value: (metricsData.avgOcf || 0).toFixed(2),
                isPercentage: true,
                subtitle: `Overall (Target: ${ranges.ocf.min}-${ranges.ocf.max}%)`
            },
            {
                title: "Average CUR",
                value: (metricsData.avgCur || 0).toFixed(2),
                isPercentage: true,
                subtitle: `Overall (Target: ${ranges.cur.min}-${ranges.cur.max}%)`
            },
            {
                title: "Average TADMC",
                value: (metricsData.avgTadmc || 0).toFixed(2),
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
// 🚀 REFACTORED: MAIN CONTROLLER 1: DASHBOARD DATA
// =====================================================================
const getDashboardData = async (req, res, next) => {
    try {
        const anchorDate = req.query.date ? new Date(req.query.date) : new Date();
        const { bucketMonth, cleanDate } = getBucketDateInfo(anchorDate);

        const kpiSettings = await KPIRange.findOne();

        // 🟢 NEW: Create a start and end boundary for the day in Manila time
        // This ensures we catch the record no matter what time of day it was saved
        const startOfDay = moment(cleanDate).tz("Asia/Manila").startOf('day').toDate();
        const endOfDay = moment(cleanDate).tz("Asia/Manila").endOf('day').toDate();

        // 🟢 FIX: Use $gte and $lte inside $elemMatch
        const currentBucket = await MonthlyReport.findOne(
            { bucketMonth },
            { 
                dailyReports: { 
                    $elemMatch: { 
                        date: {
                            $gte: startOfDay,
                            $lte: endOfDay
                        }
                    } 
                } 
            }
        );

        // Access the first (and only) matched element from the projected array
        const todayReport = currentBucket?.dailyReports?.[0];

        // Fallback objects if data is missing
        const defaultStats = {
            totalClaimed: 0, totalUnclaimed: 0,
            totalSnacksClaimed: 0, totalMealsClaimed: 0,
            totalEligible: 0, totalAbsences: 0, totalWaived: 0
        };

        const defaultFinancials = {
            totalUsedCredits: 0, totalUnusedCredits: 0, 
            totalAllottedCredits: 0, totalOnHandCash: 0
        };

        const currentStats = todayReport ? todayReport.statistics : defaultStats;
        const currentFinancials = todayReport ? todayReport.financials : defaultFinancials;

        // Parallel fetch for aggregated views
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
            overall,
            stats: {
                ...currentStats.toObject?.() || currentStats, // handle mongoose doc vs plain obj
                eligibleStudentCount: currentStats.totalEligible,
                absentStudentCount: currentStats.totalAbsences,
                waivedStudentCount: currentStats.totalWaived
            },
            financials: currentFinancials
        });

    } catch (error) {
        console.error("❌ Dashboard Error:", error);
        next(error);
    }
};

// =====================================================================
// 🚀 REFACTORED: MAIN CONTROLLER 2: FINANCIAL REPORT
// =====================================================================
const getFinancialReport = async (req, res, next) => {
    try {
        const anchorDate = req.query.date ? new Date(req.query.date) : new Date();
        console.log(`💰 Generating Financial Report for: ${anchorDate.toLocaleDateString()}`);

        const [daily, weekly, monthly] = await Promise.all([
            getDailyData(anchorDate),
            getWeeklyData(anchorDate),
            getMonthlyData(anchorDate) // Now uses the ultra-fast monthly aggregate
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

// =====================================================================
// 🟢 REFACTORED: addDishes (Upserting into the Bucket)
// =====================================================================
// =====================================================================
// 🟢 REFACTORED: addDishes (With Root Schema Initialization)
// =====================================================================
const addDishes = async (req, res, next) => {
    try {
        const { dishes, date } = req.body;

        if (!dishes || !Array.isArray(dishes) || dishes.length === 0) {
            return res.status(400).json({ message: "Please provide an array of dishes (strings)." });
        }

        const { bucketMonth, academicYear, cleanDate, dayOfWeek } = getBucketDateInfo(date);

        // 1. Find the Monthly Bucket. If it doesn't exist, create it.
        let monthlyReport = await MonthlyReport.findOne({ bucketMonth });
        if (!monthlyReport) {
            // 🟢 FIX: Initialize the root-level required schemas
            monthlyReport = new MonthlyReport({
                bucketMonth,
                academicYear,
                dailyReports: [],
                statistics: { totalEligible: 0, totalSnacksClaimed: 0, totalMealsClaimed: 0, totalClaimed: 0, totalUnclaimed: 0, totalWaived: 0, totalAbsences: 0 },
                financials: { totalAllottedCredits: 0, totalUsedCredits: 0, totalUnusedCredits: 0, totalOnHandCash: 0 }
            });
        }

        let dailyReportIndex = monthlyReport.dailyReports.findIndex(
            dr => dr.date.getTime() === cleanDate.getTime()
        );

        let actionType = 'UPDATE_MENU';

        if (dailyReportIndex === -1) {
            actionType = 'CREATE_AND_UPDATE_MENU';
            monthlyReport.dailyReports.push({
                date: cleanDate,
                dayOfWeek: dayOfWeek,
                menu: dishes,
                metrics: { tadmc: 0, cur: 0, ocf: 0 },
                statistics: { totalEligible: 0, totalSnacksClaimed: 0, totalMealsClaimed: 0, totalClaimed: 0, totalUnclaimed: 0, totalWaived: 0, totalAbsences: 0 },
                financials: { totalAllottedCredits: 0, totalUsedCredits: 0, totalUnusedCredits: 0, totalOnHandCash: 0 }
            });
        } else {
            const currentMenu = new Set(monthlyReport.dailyReports[dailyReportIndex].menu);
            dishes.forEach(d => currentMenu.add(d));
            monthlyReport.dailyReports[dailyReportIndex].menu = Array.from(currentMenu);
        }

        await monthlyReport.save();

        const actorID = req.user ? (req.user._id || req.user.userID) : 'SYSTEM';
        const actorName = req.user ? req.user.email : 'Admin';
        const formattedDateStr = cleanDate.toLocaleDateString();

        await logAction(
            { id: actorID, type: 'User', name: actorName, role: 'ADMIN' },
            actionType, 'SUCCESS',
            { description: `Added dishes: ${dishes.join(', ')} to ${formattedDateStr}`, referenceID: monthlyReport._id }
        );

        const updatedDailyReport = monthlyReport.dailyReports.find(dr => dr.date.getTime() === cleanDate.getTime());

        res.status(200).json({ message: "Menu updated successfully.", data: updatedDailyReport.menu });

    } catch (error) {
        next(error);
    }
};

// =====================================================================
// 🟢 REFACTORED: viewDishes (Fetching from the Bucket)
// =====================================================================
const viewDishes = async (req, res, next) => {
    try {
        const { bucketMonth, cleanDate } = getBucketDateInfo(req.query.date);

        // Fetch just the bucket
        const reportBucket = await MonthlyReport.findOne({ bucketMonth });

        if (!reportBucket) {
            return res.status(404).json({ message: `No report bucket found for ${bucketMonth}.` });
        }

        // Find the specific day inside the array
        const dailyReport = reportBucket.dailyReports.find(dr => dr.date.getTime() === cleanDate.getTime());

        if (!dailyReport) {
            return res.status(404).json({ message: `No daily report found for ${cleanDate.toLocaleDateString()}.` });
        }

        res.status(200).json({
            date: cleanDate.toLocaleDateString(),
            dayOfWeek: dailyReport.dayOfWeek,
            dishes: dailyReport.menu || []
        });

    } catch (error) {
        next(error);
    }
};

const exportAndArchiveReport = async (req, res, next) => {
    try {
        const { bucketMonth } = req.body; // Expecting something like "2026-03"

        if (!bucketMonth) {
            return res.status(400).json({ message: "bucketMonth is required for export." });
        }

        // 1. Fetch the target month
        const report = await MonthlyReport.findOne({ bucketMonth });

        if (!report) {
            return res.status(404).json({ message: `No record found for ${bucketMonth}.` });
        }

        // 2. Initiate the 24-Hour Fail-Safe Countdown
        const manilaNow = moment().tz("Asia/Manila");
        const purgeDate = manilaNow.clone().add(24, 'hours').toDate();

        report.isPendingPurge = true;
        report.scheduledPurgeDate = purgeDate;
        
        await report.save();

        console.log(`📦 [EXPORT] ${bucketMonth} prepared for download. Purge scheduled for: ${purgeDate}`);

        // 3. Return the full payload to the frontend so it can build the PDF
        return res.status(200).json({
            message: "Data ready for export. 24-hour archive timer started.",
            scheduledPurgeDate: purgeDate,
            data: report 
        });

    } catch (error) {
        console.error("❌ Error in exportAndArchiveReport:", error);
        next(error);
    }
};

const exportAllStudents = async (req, res, next) => {
    try {
        // 🟢 Extract both format AND level from query (default to 'all' just in case)
        const { format, level = 'all' } = req.query; 

        if (!['csv', 'excel'].includes(format)) {
            return res.status(400).json({ message: "Invalid format. Use 'csv' or 'excel'." });
        }
        
        if (!['all', 'basic', 'higher'].includes(level)) {
            return res.status(400).json({ message: "Invalid level. Use 'all', 'basic', or 'higher'." });
        }

        let basicBase64 = null;
        let higherBase64 = null;
        
        // Determine file extensions and MIME types once
        const isExcel = format === 'excel';
        const contentType = isExcel 
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
            : 'text/csv';
        const extension = isExcel ? 'xlsx' : 'csv';

        // =========================================================
        // 1. GENERATE BASIC ED (If requested)
        // =========================================================
        if (level === 'all' || level === 'basic') {
            // Optimized query: Only fetch students with a section
            const basicData = await Student.find({ section: { $exists: true, $ne: null, $ne: "" } }).lean();

            const wbBasic = new ExcelJS.Workbook();
            const wsBasic = wbBasic.addWorksheet('Basic Ed');
            
            wsBasic.columns = [
                { header: 'Student ID', key: 'studentID', width: 15 },
                { header: 'First Name', key: 'first_name', width: 20 },
                { header: 'Middle Name', key: 'middle_name', width: 15 },
                { header: 'Last Name', key: 'last_name', width: 20 },
                { header: 'Section', key: 'section', width: 15 },
                { header: 'Year', key: 'year', width: 10 }
            ];
            wsBasic.addRows(basicData);

            const basicBuffer = isExcel 
                ? await wbBasic.xlsx.writeBuffer() 
                : await wbBasic.csv.writeBuffer();
                
            basicBase64 = basicBuffer.toString('base64');
        }

        // =========================================================
        // 2. GENERATE HIGHER ED (If requested)
        // =========================================================
        if (level === 'all' || level === 'higher') {
            // Optimized query: Only fetch students with a program
            const higherData = await Student.find({ program: { $exists: true, $ne: null, $ne: "" } }).lean();

            const wbHigher = new ExcelJS.Workbook();
            const wsHigher = wbHigher.addWorksheet('Higher Ed');
            
            wsHigher.columns = [
                { header: 'Student ID', key: 'studentID', width: 15 },
                { header: 'First Name', key: 'first_name', width: 20 },
                { header: 'Middle Name', key: 'middle_name', width: 15 },
                { header: 'Last Name', key: 'last_name', width: 20 },
                { header: 'Program', key: 'program', width: 15 },
                { header: 'Year', key: 'year', width: 10 }
            ];
            wsHigher.addRows(higherData);

            const higherBuffer = isExcel 
                ? await wbHigher.xlsx.writeBuffer() 
                : await wbHigher.csv.writeBuffer();
                
            higherBase64 = higherBuffer.toString('base64');
        }

        // =========================================================
        // 3. SEND PAYLOAD
        // =========================================================
        return res.status(200).json({
            message: "Files generated successfully",
            files: {
                basic: basicBase64, // Will be null if they only asked for 'higher'
                higher: higherBase64 // Will be null if they only asked for 'basic'
            },
            contentType,
            extension
        });

    } catch (error) {
        console.error("❌ Export Error:", error);
        next(error);
    }
};


export {
    initializeDailyStudentRecord,
    finalizeTodayRecord,

    initializeDailyReport,
    initializeDailyReportLogic,

    addDishes,
    viewDishes,

    getDashboardData,
    getFinancialReport,

    exportAndArchiveReport,
    exportAllStudents
};