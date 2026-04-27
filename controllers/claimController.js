// FIX 2: Import the safe logging wrapper function from loggerController.js
import { logClaimAttempt } from "./loggerController.js";

import ClaimRecord from "../models/claimRecord.js";
import mealValue from "../models/mealValue.js"
import Report from "../models/report.js";
import Student from "../models/student.js";

import Setting from "../models/setting.js";
import Event from "../models/event.js";
import eligibilityBasicEd from "../models/eligibilityBasicEd.js";
import eligibilityHigherEd from "../models/eligibilityHigherEd.js";
import Credit from "../models/credit.js";
import ProgramSchedule from "../models/ProgramSchedule.js";
import { logAction } from "./systemLoggerController.js"

import MonthlyReport from "../models/monthlyReport.js";

// 🟢 HELPER: Get PH Date Range (To ensure we hit the right daily record)
const getPHDateRange = () => {
    const now = new Date();
    const options = { timeZone: "Asia/Manila", year: 'numeric', month: 'numeric', day: 'numeric' };
    const phDateString = now.toLocaleDateString("en-US", options);
    const [month, day, year] = phDateString.split('/').map(num => parseInt(num));

    // Calculate Manila Start of Day (00:00) in UTC
    const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
    const startOfDayVal = Date.UTC(year, month - 1, day) - PH_OFFSET_MS;

    return {
        start: new Date(startOfDayVal),
        end: new Date(startOfDayVal + (24 * 60 * 60 * 1000) - 1)
    };
};

//Helper 2: asynchronous computation for financials and metrics
/**
 * @desc Background task to recalculate TADMC, CUR, and OCF after a claim.
 * It does not block the main thread.
 */
const recalculateDailyMetrics = async (bucketMonth, startOfDay, endOfDay) => {
    try {
        // 1. Fetch the current report for today
        const report = await MonthlyReport.findOne(
            { bucketMonth, "dailyReports.date": { $gte: startOfDay, $lte: endOfDay } },
            { "dailyReports.$": 1 } // Only return today's array element for speed
        );

        if (!report || !report.dailyReports || report.dailyReports.length === 0) return;

        const todayData = report.dailyReports[0];
        const stats = todayData.statistics;
        const fins = todayData.financials;

        // 2. Safely perform the math to avoid Divide-by-Zero errors
        const totalClaims = stats.totalClaimed || 0;
        const totalUsed = fins.totalUsedCredits || 0;
        const totalAllotted = fins.totalAllottedCredits || 0;
        const totalCash = fins.totalOnHandCash || 0; // Assuming we add this tracking

        const tadmc = totalClaims > 0 ? (totalUsed / totalClaims) : 0;
        const cur = totalAllotted > 0 ? ((totalUsed / totalAllotted) * 100) : 0;
        const ocf = totalUsed > 0 ? ((totalCash / totalUsed) * 100) : 0;

        // 3. Save the calculated metrics directly to the array element
        await MonthlyReport.updateOne(
            { bucketMonth },
            {
                $set: {
                    "dailyReports.$[todayRecord].metrics.tadmc": Number(tadmc.toFixed(2)),
                    "dailyReports.$[todayRecord].metrics.cur": Number(cur.toFixed(2)),
                    "dailyReports.$[todayRecord].metrics.ocf": Number(ocf.toFixed(2))
                }
            },
            {
                arrayFilters: [{ "todayRecord.date": { $gte: startOfDay, $lte: endOfDay } }]
            }
        );

    } catch (error) {
        console.error("❌ Background Metric Calculation Error:", error.message);
    }
};

const claimMeal = async (req, res, next) => {
    try {
        const { studentInput } = req.body;

        // 1. Resolve Search Key (Student ID vs RFID)
        const hyphenRegex = /-/;
        const searchKey = hyphenRegex.test(studentInput) ? 'studentID' : 'rfidTag';

        // 2. Find Student
        const student = await Student.findOne({ [searchKey]: studentInput });
        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }

        // 3. Validation: Check Student's Profile
        if (student.temporaryClaimStatus !== 'ELIGIBLE') {
            return res.status(409).json({
                message: `Status is ${student.temporaryClaimStatus}. Cannot claim.`
            });
        }

        if (student.temporaryCreditBalance <= 0) {
            return res.status(409).json({ message: "Insufficient credit balance." });
        }

        // 4. Fetch Meal Value (Cost)
        const creditModel = await mealValue.findOne();
        if (!creditModel) return res.status(500).json({ message: "System error: Meal value not set." });
        const MEAL_COST = creditModel.mealValue;

        // 5. Enforce Strict Manila Time Boundaries
        const now = new Date();
        const manilaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Manila" });
        const manilaDate = new Date(manilaTimeStr);

        const startOfDay = new Date(manilaDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(manilaDate);
        endOfDay.setHours(23, 59, 59, 999);

        const bucketMonth = `${manilaDate.getFullYear()}-${String(manilaDate.getMonth() + 1).padStart(2, '0')}`;

        // =========================================================
        // 🟢 6. CONCURRENT DATABASE UPDATES (Using Promise.all)
        // =========================================================

        // A. Update Student Profile
        const updateStudentPromise = Student.updateOne(
            { studentID: student.studentID },
            {
                $set: {
                    temporaryCreditBalance: 0,
                    temporaryClaimStatus: "CLAIMED"
                },
                $push: {
                    claimRecords: {
                        date: manilaDate,
                        creditClaimed: MEAL_COST,
                        remarks: ["CLAIMED"]
                    }
                }
            }
        );

        // B. Sync with ClaimRecord (Masterlist)
        const updateClaimRecordPromise = (async () => {
            const dailyRecord = await ClaimRecord.findOne({
                claimDate: { $gte: startOfDay, $lte: endOfDay }
            });

            if (dailyRecord) {
                let foundSectionIdx = -1;
                let foundStudentIdx = -1;

                for (let i = 0; i < dailyRecord.claimRecords.length; i++) {
                    const sIdx = dailyRecord.claimRecords[i].eligibleStudents.findIndex(s => s.studentID === student.studentID);
                    if (sIdx !== -1) {
                        foundSectionIdx = i;
                        foundStudentIdx = sIdx;
                        break;
                    }
                }

                if (foundSectionIdx !== -1 && foundStudentIdx !== -1) {
                    const path = `claimRecords.${foundSectionIdx}.eligibleStudents.${foundStudentIdx}`;
                    await ClaimRecord.updateOne(
                        { _id: dailyRecord._id },
                        {
                            $set: {
                                [`${path}.claimType`]: "MEAL-CLAIM",
                                [`${path}.creditBalance`]: 0
                            }
                        }
                    );
                }
            }
        })();

        // C. Update Dashboard Analytics (MonthlyReport)
        const updateDashboardPromise = MonthlyReport.findOneAndUpdate(
            { bucketMonth },
            {
                $inc: {
                    // Update Root Totals
                    "statistics.totalMealsClaimed": 1,
                    "statistics.totalClaimed": 1,
                    "financials.totalUsedCredits": MEAL_COST,
                    "financials.totalUnusedCredits": -MEAL_COST, // Shift from Unused to Used

                    // Update Today's Specific Array Element
                    "dailyReports.$[todayRecord].statistics.totalMealsClaimed": 1,
                    "dailyReports.$[todayRecord].statistics.totalClaimed": 1,
                    "dailyReports.$[todayRecord].financials.totalUsedCredits": MEAL_COST,
                    "dailyReports.$[todayRecord].financials.totalUnusedCredits": -MEAL_COST
                }
            },
            {
                new: true,
                arrayFilters: [{ "todayRecord.date": { $gte: startOfDay, $lte: endOfDay } }]
            }
        );

        // D. System Logging
        const loggingPromise = logAction(
            { id: student._id, type: 'User', name: student.studentID, role: 'STUDENT' },
            'CLAIM_MEAL',
            'SUCCESS',
            {
                description: `Claimed Standard Meal`,
                creditUsed: MEAL_COST,
                cashPaid: 0
            }
        );

        // Execute all 4 database operations instantly and concurrently
        await Promise.all([
            updateStudentPromise,
            updateClaimRecordPromise,
            updateDashboardPromise,
            loggingPromise
        ]);

        // =========================================================
        // 7. Post-Claim Actions (Sockets & Background Math)
        // =========================================================

        const io = req.app.get('socketio');
        if (io) {
            io.emit('meal-claimed', {
                studentID: student.studentID,
                section: student.section || student.program,
                timestamp: new Date()
            });
        }

        // 🔥 FIRE AND FORGET: Update TADMC, CUR, OCF in the background.
        // We do NOT use 'await' here so the POS tablet doesn't have to wait.
        recalculateDailyMetrics(bucketMonth, startOfDay, endOfDay);

        // 8. Return Success Payload
        return res.status(200).json({
            message: "Meal claimed successfully!",
            data: {
                name: `${student.first_name} ${student.last_name}`,
                studentID: student.studentID,
                status: "CLAIMED",
                remainingBalance: 0
            }
        });

    } catch (error) {
        console.error("❌ Meal Claim Error:", error);
        next(error);
    }
};

const claimFood = async (req, res, next) => {
    try {
        const { studentID } = req.params;
        const { creditTaken } = req.body;

        // 1. Input Validation
        if (typeof creditTaken !== 'number' || creditTaken <= 0) {
            return res.status(400).json({ message: 'Invalid credit amount. Must be a positive number.' });
        }

        // 2. Find Student
        const student = await Student.findOne({ studentID });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // 3. Validate Eligibility
        if (student.temporaryClaimStatus !== 'ELIGIBLE') {
            return res.status(409).json({ message: `Student status is ${student.temporaryClaimStatus}. Cannot claim.` });
        }

        if (student.temporaryCreditBalance <= 0) {
            return res.status(409).json({ message: 'Student has no remaining credit balance.' });
        }

        // ---------------------------------------------------------
        // 🧮 4. CALCULATION LOGIC (Credits vs On-Hand Cash)
        // ---------------------------------------------------------
        const currentBalance = student.temporaryCreditBalance;

        let amountDeductedFromCredit = 0;
        let amountPaidInCash = 0;

        if (creditTaken > currentBalance) {
            amountDeductedFromCredit = currentBalance;
            amountPaidInCash = creditTaken - currentBalance;
        } else {
            amountDeductedFromCredit = creditTaken;
            amountPaidInCash = 0;
        }

        const newStudentBalance = currentBalance - amountDeductedFromCredit;
        const newStatus = newStudentBalance === 0 ? "CLAIMED" : "ELIGIBLE";

        // ---------------------------------------------------------
        // 5. ENFORCE MANILA TIME BOUNDARIES
        // ---------------------------------------------------------
        const now = new Date();
        const manilaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Manila" });
        const manilaDate = new Date(manilaTimeStr);

        const startOfDay = new Date(manilaDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(manilaDate);
        endOfDay.setHours(23, 59, 59, 999);

        const bucketMonth = `${manilaDate.getFullYear()}-${String(manilaDate.getMonth() + 1).padStart(2, '0')}`;

        // =========================================================
        // 🟢 6. CONCURRENT DATABASE UPDATES (Using Promise.all)
        // =========================================================

        // A. Update Student Profile
        const updateStudentPromise = Student.updateOne(
            { studentID: student.studentID },
            {
                $set: {
                    temporaryCreditBalance: newStudentBalance,
                    temporaryClaimStatus: newStatus
                },
                $push: {
                    claimRecords: {
                        date: manilaDate,
                        creditClaimed: amountDeductedFromCredit,
                        remarks: amountPaidInCash > 0 ? ["PARTIAL-CASH", `CASH:${amountPaidInCash}`] : ["CLAIMED"]
                    }
                }
            }
        );

        // B. Update Master ClaimRecord
        const updateClaimRecordPromise = (async () => {
            const dailyRecord = await ClaimRecord.findOne({
                claimDate: { $gte: startOfDay, $lte: endOfDay }
            });

            if (dailyRecord) {
                let foundSectionIdx = -1;
                let foundStudentIdx = -1;

                for (let i = 0; i < dailyRecord.claimRecords.length; i++) {
                    const sIdx = dailyRecord.claimRecords[i].eligibleStudents.findIndex(s => s.studentID === student.studentID);
                    if (sIdx !== -1) {
                        foundSectionIdx = i;
                        foundStudentIdx = sIdx;
                        break;
                    }
                }

                if (foundSectionIdx !== -1 && foundStudentIdx !== -1) {
                    const path = `claimRecords.${foundSectionIdx}.eligibleStudents.${foundStudentIdx}`;
                    await ClaimRecord.updateOne(
                        { _id: dailyRecord._id },
                        {
                            $set: {
                                [`${path}.creditBalance`]: newStudentBalance,
                                [`${path}.claimType`]: newStatus === "CLAIMED" ? "MEAL-CLAIM" : "PARTIAL"
                            },
                            $inc: {
                                [`${path}.onHandCash`]: amountPaidInCash
                            }
                        }
                    );
                }
            }
        })();

        // C. Update Dashboard Analytics (Dynamic Math)
        // We dynamically build the $inc object based on exact deductions
        const dashboardIncMath = {
            "statistics.totalSnacksClaimed": 1,
            "financials.totalUsedCredits": amountDeductedFromCredit,
            "financials.totalUnusedCredits": -amountDeductedFromCredit,
            "financials.totalOnHandCash": amountPaidInCash,

            "dailyReports.$[todayRecord].statistics.totalSnacksClaimed": 1,
            "dailyReports.$[todayRecord].financials.totalUsedCredits": amountDeductedFromCredit,
            "dailyReports.$[todayRecord].financials.totalUnusedCredits": -amountDeductedFromCredit,
            "dailyReports.$[todayRecord].financials.totalOnHandCash": amountPaidInCash
        };

        // 🟢 If this snack depleted their balance to 0, move them from Unclaimed to Claimed headcount!
        if (newStatus === "CLAIMED") {
            dashboardIncMath["statistics.totalClaimed"] = 1;
            dashboardIncMath["statistics.totalUnclaimed"] = -1; // Balances the scale!

            dashboardIncMath["dailyReports.$[todayRecord].statistics.totalClaimed"] = 1;
            dashboardIncMath["dailyReports.$[todayRecord].statistics.totalUnclaimed"] = -1; // Balances the scale!
        }

        // 🟢 Pass the dynamic object directly into $inc
        const updateDashboardPromise = MonthlyReport.findOneAndUpdate(
            { bucketMonth },
            {
                $inc: dashboardIncMath
            },
            {
                new: true,
                arrayFilters: [{ "todayRecord.date": { $gte: startOfDay, $lte: endOfDay } }]
            }
        );

        // D. System Logging
        const loggingPromise = logAction(
            { id: student._id, type: 'User', name: student.studentID, role: 'STUDENT' },
            'CLAIM_FOOD',
            'SUCCESS',
            {
                description: `Claimed Item/Snack worth ${creditTaken}`,
                creditUsed: amountDeductedFromCredit,
                cashPaid: amountPaidInCash
            }
        );

        // Execute all updates simultaneously
        await Promise.all([
            updateStudentPromise,
            updateClaimRecordPromise,
            updateDashboardPromise,
            loggingPromise
        ]);

        // =========================================================
        // 7. Post-Claim Actions (Sockets & Background Math)
        // =========================================================
        const io = req.app.get('socketio');
        if (io) {
            io.emit('meal-claimed', {
                studentID: student.studentID,
                section: student.section || student.program,
                timestamp: new Date()
            });
        }

        // 🔥 FIRE AND FORGET: Update OCF and CUR in the background
        recalculateDailyMetrics(bucketMonth, startOfDay, endOfDay);

        // 8. Return Success Payload
        return res.json({
            studentID: student.studentID,
            Name: `${student.first_name} ${student.last_name}`,
            creditUsed: amountDeductedFromCredit,
            cashPaid: amountPaidInCash,
            remainingBalance: newStudentBalance,
            status: newStatus
        });

    } catch (error) {
        console.error("❌ Food Claim Error:", error);
        next(error);
    }
};

// --- New function to deduct creditValue ---
const deductCredits = async (req, res, next) => {
    try {
        const student = await Student.findOne({ studentID: req.params.studentID });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const { creditTaken } = req.body; // Expect creditTaken in the request body

        if (typeof creditTaken !== 'number' || creditTaken <= 0) {
            return res.status(400).json({ message: 'Invalid creditTaken value. Must be a positive number.' });
        }

        if (student.creditValue < creditTaken) {
            // FIX 4: Added logging
            await logClaimAttempt(student.studentID, 'DEDUCT-ATTEMPT-INSUFFICIENT-BALANCE', 0);
            return res.status(400).json({ message: 'Not enough credit value to deduct.' });
        }

        student.creditValue -= creditTaken; // Deduct credits
        await student.save();

        // FIX 4: Added logging
        await logClaimAttempt(student.studentID, 'DEDUCT-CREDIT', creditTaken);

        // Display the updated student information
        const responseData = {
            studentID: student.studentID,
            Name: student.name,
            Course: student.course,
            mealEligibilityStatus: student.mealEligibilityStatus,
            creditValue: student.creditValue // Display the new creditValue
        };

        res.json(responseData);
    } catch (error) {
        next(error);
    }
};

const getAcademicYear = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

/**
 * @desc Sweeps the database at the end of the day. 
 * Reclaims credits from students who didn't eat, updates the POS masterlist, 
 * and pushes "Unclaimed" stats to the dashboard.
 */
const assignCreditsForEvents = async (req, res) => {
    try {
        const now = new Date();
        const dateToday = now.getDate();
        const bucketMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        let totalAssignedAcrossAllEvents = 0;
        const processedEventsDetails = [];

        const mealConfig = await mealValue.findOne({});
        if (!mealConfig) {
            if (res) return res.status(400).json({ success: false, message: "Meal value configuration not found." });
            return;
        }

        const currentMealValue = mealConfig.mealValue;

        const ongoingEvents = await Event.find({
            submissionStatus: 'APPROVED',
            scheduleStatus: 'ONGOING'
        });

        for (const ev of ongoingEvents) {
            const approvedSections = ev.forEligibleSection || [];
            const approvedProgramsAndYears = ev.forEligibleProgramsAndYear || [];

            const sectionQueries = approvedSections
                .filter(s => s.section != null && s.year != null)
                .map(s => ({
                    section: { $regex: new RegExp(`^${String(s.section).trim()}$`, 'i') },
                    year: String(s.year).trim()
                }));

            const programQueries = approvedProgramsAndYears
                .filter(p => p.program != null && p.year != null)
                .map(p => ({
                    program: { $regex: new RegExp(`^${String(p.program).trim()}$`, 'i') },
                    year: String(p.year).trim()
                }));

            const queryConditions = [...sectionQueries, ...programQueries];

            if (queryConditions.length === 0) continue;

            const query = { $or: queryConditions };

            const eligibleStudents = await Student.find(query).select('studentID section program year');
            const studentsAssignedCount = eligibleStudents.length;

            if (studentsAssignedCount === 0) continue;

            const sectionCounts = {};
            const programCounts = {};

            for (const student of eligibleStudents) {
                if (student.section) {
                    const key = `${student.section.trim()}-${student.year.trim()}`.toLowerCase();
                    sectionCounts[key] = (sectionCounts[key] || 0) + 1;
                } else if (student.program) {
                    const key = `${student.program.trim()}-${student.year.trim()}`.toLowerCase();
                    programCounts[key] = (programCounts[key] || 0) + 1;
                }
            }

            let eventNeedsSaving = false;

            if (ev.forEligibleSection.length > 0) {
                ev.forEligibleSection.forEach(sec => {
                    const key = `${sec.section.trim()}-${sec.year.trim()}`.toLowerCase();
                    if (sectionCounts[key]) {
                        sec.totalEligibleCount += sectionCounts[key];
                        eventNeedsSaving = true;
                    }
                });
            }

            if (ev.forEligibleProgramsAndYear.length > 0) {
                ev.forEligibleProgramsAndYear.forEach(prog => {
                    const key = `${prog.program.trim()}-${prog.year.trim()}`.toLowerCase();
                    if (programCounts[key]) {
                        prog.totalEligibleCount += programCounts[key];
                        eventNeedsSaving = true;
                    }
                });
            }

            if (eventNeedsSaving) {
                await ev.save();
            }

            await Student.updateMany(query, {
                $set: {
                    temporaryCreditBalance: currentMealValue,
                    temporaryClaimStatus: 'ELIGIBLE'
                }
            });

            const logPromises = eligibleStudents.map(student =>
                logClaimAttempt(student.studentID, 'ASSIGN-CREDIT', currentMealValue)
            );
            await Promise.all(logPromises);

            const totalNewCredits = studentsAssignedCount * currentMealValue;
            totalAssignedAcrossAllEvents += studentsAssignedCount;

            const sectionNames = approvedSections.length > 0
                ? approvedSections.map(s => {
                    const key = `${s.section.trim()}-${s.year.trim()}`.toLowerCase();
                    const count = sectionCounts[key] || 0;
                    return `${s.section} (Year ${s.year}): ${count} students`;
                }).join(', ')
                : 'None';

            const programNames = approvedProgramsAndYears.length > 0
                ? approvedProgramsAndYears.map(p => {
                    const key = `${p.program.trim()}-${p.year.trim()}`.toLowerCase();
                    const count = programCounts[key] || 0;
                    return `${p.program} (Year ${p.year}): ${count} students`;
                }).join(', ')
                : 'None';

            processedEventsDetails.push({
                eventName: ev.eventName,
                programs: programNames,
                sections: sectionNames,
                totalStudentsForEvent: studentsAssignedCount,
                eventCreditsAdded: totalNewCredits
            });

            console.log(`✅ Processed ONGOING event '${ev.eventName}' - ${studentsAssignedCount} students.`);
        }

        // ---------------------------------------------------------
        // 🟢 THE MODIFICATION: Finalized Math & Single Dashboard Update
        // ---------------------------------------------------------
        const totalCreditsAllocatedToDashboard = totalAssignedAcrossAllEvents * currentMealValue;

        if (totalAssignedAcrossAllEvents > 0) {
            let report = await MonthlyReport.findOne({ bucketMonth });

            if (!report) {
                report = new MonthlyReport({
                    bucketMonth: bucketMonth,
                    academicYear: getAcademicYear(now),
                    statistics: {},
                    financials: {},
                    dailyReports: []
                });
            }

            report.statistics.totalEligible += totalAssignedAcrossAllEvents;
            report.statistics.totalUnclaimed += totalAssignedAcrossAllEvents;
            report.financials.totalAllottedCredits += totalCreditsAllocatedToDashboard;
            report.financials.totalUnusedCredits += totalCreditsAllocatedToDashboard;

            let dailyIndex = report.dailyReports.findIndex(
                (dr) => dr.date.getDate() === dateToday && dr.date.getMonth() === now.getMonth()
            );

            if (dailyIndex === -1) {
                const daysOfWeek = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
                report.dailyReports.push({
                    date: now,
                    dayOfWeek: daysOfWeek[now.getDay()],
                    menu: [],
                    metrics: {},
                    statistics: {},
                    financials: {}
                });
                dailyIndex = report.dailyReports.length - 1;
            }

            report.dailyReports[dailyIndex].statistics.totalEligible += totalAssignedAcrossAllEvents;
            report.dailyReports[dailyIndex].statistics.totalUnclaimed += totalAssignedAcrossAllEvents;
            report.dailyReports[dailyIndex].financials.totalAllottedCredits += totalCreditsAllocatedToDashboard;
            report.dailyReports[dailyIndex].financials.totalUnusedCredits += totalCreditsAllocatedToDashboard;

            await report.save();
            console.log(`✅ Dashboard officially updated: +${totalAssignedAcrossAllEvents} eligible, +${totalCreditsAllocatedToDashboard} credits.`);
        }

        if (res) {
            return res.status(200).json({
                success: true,
                message: `Successfully processed ${processedEventsDetails.length} ONGOING events. Bestowed credits to ${totalAssignedAcrossAllEvents} students and allocated a total of ${totalCreditsAllocatedToDashboard} credits to the dashboard.`,
                details: processedEventsDetails,
                dashboardLogs: {
                    reportMonth: bucketMonth,
                    dayUpdated: dateToday,
                    totalEligibleIncrease: totalAssignedAcrossAllEvents,
                    totalAllottedCreditsIncrease: totalCreditsAllocatedToDashboard
                }
            });
        }

    } catch (error) {
        console.error("Error in assignCreditsForEvents:", error);
        if (res) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }
};


// =========================================================
// 🟢 FAKE MEAL CLAIM (With Logger)
// =========================================================
const fakeMealClaim = async (req, res, next) => {
    try {
        const { studentInput } = req.query; // Using query for GET

        if (!studentInput) {
            return res.status(400).json({ message: "Please provide a Student ID or RFID Tag." });
        }

        // 1. Find Student
        const student = await Student.findOne({
            $or: [
                { studentID: studentInput },
                { rfidTag: studentInput }
            ]
        });

        if (!student) {
            return res.status(404).json({ message: "Student not found." });
        }

        // 2. Update Student Status
        student.temporaryClaimStatus[0] = "CLAIMED";
        await student.save();

        // 🟢 3. SYSTEM LOG: Fake Meal Claim
        // We log it as 'CLAIM_MEAL' so it shows up in history
        await logAction(
            {
                id: student._id,
                type: 'Student',
                name: `${student.first_name} ${student.last_name}`,
                role: 'BENEFICIARY'
            },
            'CLAIM_MEAL',
            'SUCCESS',
            {
                mealType: 'LUNCH', // Or 'FAKE-MEAL' if you want to distinguish
                description: 'Claimed meal (Simulation)'
            }
        );

        // 4. Response
        res.status(200).json(student);

    } catch (error) {
        next(error);
    }
};

// =========================================================
// 🟢 FAKE FOOD ITEM CLAIM (With Logger)
// =========================================================
const fakeFoodItemClaim = async (req, res, next) => {
    try {
        // Expecting JSON body: { "studentInput": "25-00025", "amount": 50, "items": ["Rice"] }
        const { studentInput, amount, items } = req.body;

        // 1. Validation
        if (!studentInput) {
            return res.status(400).json({ message: "Please provide a Student ID or RFID Tag." });
        }
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ message: "Please provide a valid positive amount to deduct." });
        }

        // 2. Find Student
        const student = await Student.findOne({
            $or: [
                { studentID: studentInput },
                { rfidTag: studentInput }
            ]
        });

        if (!student) {
            return res.status(404).json({ message: "Student not found." });
        }

        // 3. Check Balance
        if (student.temporaryCreditBalance < amount) {

            // 🟢 LOG FAILURE
            await logAction(
                { id: student._id, type: 'Student', name: student.first_name, role: 'BENEFICIARY' },
                'CLAIM_ITEM',
                'FAILED',
                { description: `Insufficient balance for item claim. Attempted: ${amount}` }
            );

            return res.status(400).json({
                message: "Transaction Failed: Insufficient Balance",
                currentBalance: student.temporaryCreditBalance,
                attemptedAmount: amount
            });
        }

        // 4. Deduct Balance
        student.temporaryCreditBalance -= amount;

        // 5. Update Status
        if (student.temporaryCreditBalance === 0) {
            if (!student.temporaryClaimStatus.includes("NO-BALANCE")) {
                student.temporaryClaimStatus = ["NO-BALANCE"];
            }
        }

        await student.save();

        // 🟢 6. SYSTEM LOG: Success
        await logAction(
            {
                id: student._id,
                type: 'Student',
                name: `${student.first_name} ${student.last_name}`,
                role: 'BENEFICIARY'
            },
            'CLAIM_ITEM',
            'SUCCESS',
            {
                items: items || ['Ala Carte Item'], // Capture specific items if sent from frontend
                description: `Purchased items worth ${amount} (Simulation)`
            }
        );

        // 7. Response
        res.status(200).json({
            message: "Item Claimed Successfully",
            studentID: student.studentID,
            deductedAmount: amount,
            remainingBalance: student.temporaryCreditBalance,
            status: student.temporaryClaimStatus
        });

    } catch (error) {
        next(error);
    }
};

const getApprovedStudentsToday = async (req, res, next) => {
    try {
        console.log("🔍 Fetching approved eligible students for today...");

        // 1. Determine "Today" and "Day Name"
        const { start, end } = getPHDateRange();

        // Convert current date to day name (0=Sunday, 1=Monday...)
        const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
        const dayName = days[start.getDay()];

        console.log(`📅 Date: ${start.toDateString()} | Day: ${dayName}`);

        // =========================================================
        // SOURCE A: Basic Education (Section-based Requests)
        // =========================================================

        const approvedRequests = await eligibilityBasicEd.find({
            status: 'APPROVED',
            timeStamp: { $gte: start, $lte: end }
        });

        // Collect IDs from Basic Ed requests
        const basicEdStudentIDs = new Set();
        approvedRequests.forEach(request => {
            if (request.forEligible && Array.isArray(request.forEligible)) {
                request.forEligible.forEach(id => basicEdStudentIDs.add(id));
            }
        });

        // =========================================================
        // SOURCE B: Higher Education (Program Schedules)
        // =========================================================

        // Find which programs have classes today
        const activeSchedules = await ProgramSchedule.find({
            dayOfWeek: dayName
        });

        // Build query conditions for these programs
        // Format: { program: "BSIS", year: "4" }
        const programConditions = activeSchedules.map(sched => ({
            program: sched.programName,
            year: sched.year
        }));

        // =========================================================
        // MERGE & FETCH
        // =========================================================

        // Construct the Master Query
        // Logic: Find Student IF (ID is in Basic Ed List) OR (Program/Year matches Today's Schedule)
        const queryConditions = [];

        // Condition 1: Basic Ed ID Match
        if (basicEdStudentIDs.size > 0) {
            queryConditions.push({
                studentID: { $in: Array.from(basicEdStudentIDs) }
            });
        }

        // Condition 2: Higher Ed Program/Year Match
        if (programConditions.length > 0) {
            // This creates an $or array inside the main query
            // e.g., { $or: [{program: "BSIS", year: "1"}, {program: "ACT", year: "2"}] }
            queryConditions.push({ $or: programConditions });
        }

        // If no criteria exist (No approved sections AND no schedules today), return empty
        if (queryConditions.length === 0) {
            return res.status(200).json([]);
        }

        // Execute the final OR query
        const students = await Student.find({
            $or: queryConditions
        });

        console.log(`✅ Found ${students.length} total students for today.`);

        return res.status(200).json(students);

    } catch (error) {
        console.error("❌ Error fetching approved students:", error);
        next(error);
    }
};

export {
    claimMeal,
    claimFood,

    deductCredits,
    assignCreditsForEvents,
    fakeMealClaim,
    fakeFoodItemClaim,
    getApprovedStudentsToday,
} 
