import MonthlyReport from '../../models/monthlyReport.js';

/**
 * @desc Checks if the current month's bucket exists (creates if missing for mid-month deployments),
 * AND checks if today is the last day of the month to initialize the next month's bucket.
 * @returns {Object} A detailed payload proving the check was executed and detailing the outcome.
 */
const checkAndCreateMonthlyReport = async () => {
    try {
        const todayStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
        const today = new Date(todayStr);

        const currentYear = today.getFullYear();
        const academicYear = `${currentYear}-${currentYear + 1}`;

        // =========================================================
        // 🟢 CHECK 1: Current Month Fallback (The Mid-Month Fix)
        // =========================================================
        const currentMonthStr = String(today.getMonth() + 1).padStart(2, '0');
        const currentBucketMonth = `${currentYear}-${currentMonthStr}`;

        let currentMonthCreated = false;

        const existingCurrentReport = await MonthlyReport.findOne({ bucketMonth: currentBucketMonth });

        if (!existingCurrentReport) {
            console.log(`⚠️ Mid-month deployment detected. Creating missing bucket for ${currentBucketMonth}...`);
            const newCurrentReport = new MonthlyReport({
                bucketMonth: currentBucketMonth,
                academicYear,
                statistics: {
                    totalEligible: 0, totalSnacksClaimed: 0, totalMealsClaimed: 0,
                    totalClaimed: 0, totalUnclaimed: 0, totalWaived: 0, totalAbsences: 0
                },
                financials: {
                    totalAllottedCredits: 0, totalUsedCredits: 0, totalUnusedCredits: 0, totalOnHandCash: 0
                },
                dailyReports: [],
                // 🟢 EXPLICIT ARCHIVE FLAGS
                isArchived: false,
                isPendingPurge: false,
                scheduledPurgeDate: null
            });
            await newCurrentReport.save();
            currentMonthCreated = true;
        }

        // =========================================================
        // 🔵 CHECK 2: Next Month Rollover (The End-of-Month Check)
        // =========================================================
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const isLastDay = tomorrow.getDate() === 1;

        let nextMonthCreated = false;

        if (isLastDay) {
            const nextMonthYear = tomorrow.getFullYear();
            const nextMonthStr = String(tomorrow.getMonth() + 1).padStart(2, '0');
            const nextBucketMonth = `${nextMonthYear}-${nextMonthStr}`;

            const existingNextReport = await MonthlyReport.findOne({ bucketMonth: nextBucketMonth });

            if (!existingNextReport) {
                console.log(`📅 Last day of the month detected. Initializing next month's bucket: ${nextBucketMonth}...`);
                const newNextReport = new MonthlyReport({
                    bucketMonth: nextBucketMonth,
                    academicYear,
                    statistics: {
                        totalEligible: 0, totalSnacksClaimed: 0, totalMealsClaimed: 0,
                        totalClaimed: 0, totalUnclaimed: 0, totalWaived: 0, totalAbsences: 0
                    },
                    financials: {
                        totalAllottedCredits: 0, totalUsedCredits: 0, totalUnusedCredits: 0, totalOnHandCash: 0
                    },
                    dailyReports: [],
                    // 🟢 EXPLICIT ARCHIVE FLAGS
                    isArchived: false,
                    isPendingPurge: false,
                    scheduledPurgeDate: null
                });
                await newNextReport.save();
                nextMonthCreated = true;
            }
        }

        // =========================================================
        // 📋 ASSEMBLE THE PROOF PAYLOAD
        // =========================================================
        const actionStatus = (currentMonthCreated || nextMonthCreated) ? "CREATED" : "ALREADY_UP_TO_DATE";

        return {
            actionTaken: actionStatus,
            message: "System evaluated both current and future month bucket requirements.",
            proof: {
                timestampEvaluated: todayStr,
                currentMonth: {
                    bucket: currentBucketMonth,
                    wasMissingAndCreated: currentMonthCreated
                },
                rolloverCheck: {
                    isLastDayOfMonth: isLastDay,
                    nextBucketCreated: nextMonthCreated
                }
            }
        };

    } catch (error) {
        console.error("❌ Error generating monthly report buckets:", error.message);
        throw error;
    }
};

/**
 * @desc Injects a blank daily report object into the current month's bucket.
 * If the month bucket does not exist (e.g., mid-month deployment), it creates it.
 * @returns {Object} A detailed payload proving the check/action.
 */
const initializeDailyReportLogic = async () => {
    try {
        // 1. Get current date in strictly Manila Time
        const now = new Date();
        const manilaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Manila" });
        const manilaDate = new Date(manilaTimeStr);

        // 2. Format variables
        const bucketMonth = `${manilaDate.getFullYear()}-${String(manilaDate.getMonth() + 1).padStart(2, '0')}`;
        const currentYear = manilaDate.getFullYear();
        const academicYear = `${currentYear}-${currentYear + 1}`;

        const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
        const dayOfWeek = days[manilaDate.getDay()];

        // 3. Set strict boundaries for today
        const startOfDay = new Date(manilaDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(manilaDate);
        endOfDay.setHours(23, 59, 59, 999);

        // 4. Prepare the Daily Slate Template
        const newDailyReport = {
            date: startOfDay,
            dayOfWeek: dayOfWeek,
            menu: [],
            metrics: { tadmc: 0, cur: 0, ocf: 0 },
            statistics: {
                totalEligible: 0, totalSnacksClaimed: 0, totalMealsClaimed: 0,
                totalClaimed: 0, totalUnclaimed: 0, totalWaived: 0, totalAbsences: 0
            },
            financials: {
                totalAllottedCredits: 0, totalUsedCredits: 0, totalUnusedCredits: 0
            }
        };

        const proofOfCheck = {
            timestampEvaluated: manilaTimeStr,
            bucketMonth: bucketMonth,
            targetDate: startOfDay.toLocaleDateString('en-US')
        };

        // 5. Look for the current month
        let currentMonthReport = await MonthlyReport.findOne({ bucketMonth });

        // =========================================================
        // 🟢 SCENARIO A: Month Missing (Deployment Fix)
        // =========================================================
        if (!currentMonthReport) {
            console.log(`⚠️ Monthly bucket ${bucketMonth} missing. Creating it alongside today's daily report...`);

            const newMonthReport = new MonthlyReport({
                bucketMonth,
                academicYear,
                statistics: {
                    totalEligible: 0, totalSnacksClaimed: 0, totalMealsClaimed: 0,
                    totalClaimed: 0, totalUnclaimed: 0, totalWaived: 0, totalAbsences: 0
                },
                financials: {
                    totalAllottedCredits: 0, totalUsedCredits: 0, totalUnusedCredits: 0
                },
                // Inject today's report directly on creation!
                dailyReports: [newDailyReport]
            });

            await newMonthReport.save();

            return {
                actionTaken: "CREATED_MONTH_AND_DAY",
                message: `Created missing monthly bucket for ${bucketMonth} and initialized today's daily slate.`,
                proof: proofOfCheck
            };
        }

        // =========================================================
        // 🔵 SCENARIO B: Month Exists, Check if Day Exists
        // =========================================================
        const todayExists = currentMonthReport.dailyReports.some(report =>
            report.date >= startOfDay && report.date <= endOfDay
        );

        if (todayExists) {
            return {
                actionTaken: "SKIPPED",
                message: "Daily report for today is already initialized.",
                proof: proofOfCheck
            };
        }

        // =========================================================
        // 🟣 SCENARIO C: Month Exists, Day is Missing (Normal Flow)
        // =========================================================
        await MonthlyReport.updateOne(
            { _id: currentMonthReport._id },
            { $push: { dailyReports: newDailyReport } }
        );

        return {
            actionTaken: "CREATED_DAY",
            message: `Successfully initialized blank Daily Report for ${dayOfWeek}.`,
            proof: proofOfCheck
        };

    } catch (error) {
        console.error("❌ Error initializing daily report:", error.message);
        throw error;
    }
};

/**
 * @desc   Automated sweep to safely hard-delete expired granular data. 
 * Scans for MonthlyReports where the 24-hour 'pending purge' safety window 
 * has closed, empties their dailyReports array to free up database space, 
 * and permanently flags the bucket as archived.
 * @route  Internal / Cron (Triggered by midnight handleSystemPulse)
 */
const purgeExpiredDataSweep = async () => {
    try {
        const nowStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
        const manilaNow = new Date(nowStr);

        // Find all reports where the purge was scheduled, and the 24-hour timer has passed
        const reportsToPurge = await MonthlyReport.find({
            isPendingPurge: true,
            scheduledPurgeDate: { $lte: manilaNow }
        });

        if (reportsToPurge.length === 0) return;

        console.log(`🧹 [PURGE SWEEP] Found ${reportsToPurge.length} bucket(s) with expired safety windows. Executing Hard Delete...`);

        for (const report of reportsToPurge) {
            // 1. Wipe out the heavy granular data (Hard Delete)
            report.dailyReports = []; 
            
            // 2. Update flags to reflect final archived state
            report.isPendingPurge = false;
            report.scheduledPurgeDate = null;
            report.isArchived = true; 

            await report.save();
            console.log(`✅ Permanently purged granular data for bucket: ${report.bucketMonth}. Retained historical aggregates.`);
        }
        
    } catch (error) {
        console.error("❌ Error executing Purge Sweep:", error.message);
    }
};

// Export them both together!
export {
    checkAndCreateMonthlyReport,
    initializeDailyReportLogic,
    purgeExpiredDataSweep
};