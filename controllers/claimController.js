// FIX 2: Import the safe logging wrapper function from loggerController.js
import { logClaimAttempt } from "./loggerController.js";

import ClaimRecord from "../models/claimRecord.js";
import mealValue from "../models/mealValue.js"
import Report from "../models/report.js";
import Student from "../models/student.js";

import Setting from "../models/setting.js";
import event from "../models/event.js";
import eligibilityBasicEd from "../models/eligibilityBasicEd.js";
import eligibilityHigherEd from "../models/eligibilityHigherEd.js";
import Credit from "../models/credit.js";
import ProgramSchedule from "../models/ProgramSchedule.js";
import { logAction } from "./systemLoggerController.js"

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

        // 3. Validation: Check Student's Profile Directly
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

        // 5. Find Today's Master Claim Record (For syncing)
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const dailyRecord = await ClaimRecord.findOne({
            claimDate: { $gte: startOfDay, $lte: endOfDay }
        });

        // =========================================================
        // 6. EXECUTE UPDATES
        // =========================================================

        // A. Update Student Profile
        await Student.updateOne(
            { studentID: student.studentID },
            {
                $set: {
                    temporaryCreditBalance: 0,
                    temporaryClaimStatus: "CLAIMED"
                },
                $push: {
                    claimRecords: {
                        date: new Date(),
                        creditClaimed: MEAL_COST,
                        remarks: ["CLAIMED"]
                    }
                }
            }
        );

        // B. Sync with ClaimRecord (if exists)
        if (dailyRecord) {
            let foundSectionIdx = -1;
            let foundStudentIdx = -1;

            // Locate student in 2D array
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

        // C. Update Daily Report (Stats) - 🟢 FIXED DATE LOGIC
        // We use Manila time explicitly to match how the Report was created
        const now = new Date();
        const manilaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Manila" });
        const manilaDate = new Date(manilaTimeStr);

        const day = manilaDate.getDate();
        const month = manilaDate.getMonth() + 1;
        const year = manilaDate.getFullYear();

        const reportUpdate = await Report.findOneAndUpdate(
            { day, month, year }, // Search criteria
            {
                $inc: {
                    // Statistics
                    "stats.totalClaimed": 1,

                    // Financials
                    "financials.totalConsumedCredits": MEAL_COST,

                    // Optional: If you track "Unused" continuously, you decrement it here
                    // "financials.totalUnusedCredits": -MEAL_COST 
                }
            },
            { new: true } // Return the updated document
        );

        if (!reportUpdate) {
            console.warn(`⚠️ Report not found for ${month}/${day}/${year}. Stats were not updated.`);
        }

        // 7. Socket Emit
        const io = req.app.get('socketio');
        if (io) {
            io.emit('meal-claimed', {
                studentID: student.studentID,
                section: student.section || student.program,
                timestamp: new Date()
            });
        }

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
        // Allow ELIGIBLE. If you allow partial claims, they might still be ELIGIBLE until balance is 0.
        if (student.temporaryClaimStatus !== 'ELIGIBLE') {
            return res.status(409).json({ message: `Student status is ${student.temporaryClaimStatus}. Cannot claim.` });
        }

        if (student.temporaryCreditBalance <= 0) {
            return res.status(409).json({ message: 'Student has no remaining credit balance.' });
        }

        // ---------------------------------------------------------
        // 🧮 CALCULATION LOGIC (The "On-Hand Cash" Logic)
        // ---------------------------------------------------------
        const currentBalance = student.temporaryCreditBalance;

        let amountDeductedFromCredit = 0;
        let amountPaidInCash = 0;

        if (creditTaken > currentBalance) {
            // Case: Item cost exceeds balance (e.g. Cost 70, Balance 50)
            amountDeductedFromCredit = currentBalance; // Deduct all 50
            amountPaidInCash = creditTaken - currentBalance; // Pay 20 in Cash
        } else {
            // Case: Balance covers cost (e.g. Cost 30, Balance 50)
            amountDeductedFromCredit = creditTaken; // Deduct 30
            amountPaidInCash = 0; // No cash needed
        }

        const newStudentBalance = currentBalance - amountDeductedFromCredit;
        const newStatus = newStudentBalance === 0 ? "CLAIMED" : "ELIGIBLE"; // Mark CLAIMED only if 0 left

        // ---------------------------------------------------------
        // 4. FIND TODAY'S MASTER RECORD (For Syncing)
        // ---------------------------------------------------------
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const dailyRecord = await ClaimRecord.findOne({
            claimDate: { $gte: startOfDay, $lte: endOfDay }
        });

        // ---------------------------------------------------------
        // 5. EXECUTE DATABASE UPDATES
        // ---------------------------------------------------------

        // A. Update Student Profile
        await Student.updateOne(
            { studentID: student.studentID },
            {
                $set: {
                    temporaryCreditBalance: newStudentBalance,
                    temporaryClaimStatus: newStatus
                },
                $push: {
                    claimRecords: {
                        date: new Date(),
                        creditClaimed: amountDeductedFromCredit,
                        remarks: amountPaidInCash > 0 ? ["PARTIAL-CASH", `CASH:${amountPaidInCash}`] : ["CLAIMED"]
                    }
                }
            }
        );

        // B. Update Master ClaimRecord (Syncing Cash & Balance)
        if (dailyRecord) {
            let foundSectionIdx = -1;
            let foundStudentIdx = -1;

            // Locate student nested in sections
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

                // We use $inc for onHandCash to accumulate it if they buy multiple times (rare but safe)
                // We use $set for creditBalance to match the student profile
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

        // C. Update Daily Report (Financials)
        const now = new Date();
        const manilaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Manila" });
        const manilaDate = new Date(manilaTimeStr);
        const day = manilaDate.getDate();
        const month = manilaDate.getMonth() + 1;
        const year = manilaDate.getFullYear();

        await Report.findOneAndUpdate(
            { day, month, year },
            {
                $inc: {
                    // Only count as "Total Claimed" if they fully used up their credits (optional logic)
                    // Or count every transaction. Usually, we track credits consumed.
                    "financials.totalConsumedCredits": amountDeductedFromCredit,
                    "financials.totalUnusedCredits": -amountDeductedFromCredit
                }
            }
        );

        // 6. Log & Response
        await logAction(
            { id: student._id, type: 'User', name: student.studentID, role: 'STUDENT' },
            'CLAIM_FOOD',
            'SUCCESS',
            {
                description: `Claimed Item: ${creditTaken}`,
                creditUsed: amountDeductedFromCredit,
                cashPaid: amountPaidInCash
            }
        );

        // Socket Emit
        const io = req.app.get('socketio');
        if (io) {
            io.emit('meal-claimed', {
                studentID: student.studentID,
                section: student.section || student.program,
                timestamp: new Date()
            });
        }

        return res.json({
            studentID: student.studentID,
            Name: `${student.first_name} ${student.last_name}`,
            creditUsed: amountDeductedFromCredit,
            cashPaid: amountPaidInCash,
            remainingBalance: newStudentBalance,
            status: newStatus
        });

    } catch (error) {
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

const removeCredits = async () => {
    const students = await Student.find();
    const updatedStudents = [];

    for (const student of students) {
        if (student.creditValue === 0) continue;

        await logClaimAttempt(student.studentID, 'REMOVED-UNUSED-BALANCE', student.creditValue);

        student.creditValue = 0;
        student.mealEligibilityStatus = 'INELIGIBLE';
        await student.save();

        updatedStudents.push({
            studentID: student.studentID,
            name: student.name,
            course: student.course,
            mealEligibilityStatus: student.mealEligibilityStatus,
            creditValue: student.creditValue
        });
    }
    return updatedStudents;
};

const assignCredits = async (dayToday) => {
    try {
        console.log(`🔄 STARTING: Assigning credits for ${dayToday}...`);

        // 1. Fetch Global Credit Value
        const creditSettings = await Credit.findOne({});
        if (!creditSettings) throw new Error("Credit value (Price) not set in database");
        const ALLOCATED_CREDIT = creditSettings.creditValue;

        // 2. Fetch Approved & Unassigned Requests
        const [basicRequests, higherRequests] = await Promise.all([
            eligibilityBasicEd.find({ status: 'APPROVED', creditAssigned: false }),
            eligibilityHigherEd.find({ status: 'APPROVED', creditAssigned: false, forDay: dayToday })
        ]);

        // 3. Extract Unique Student IDs
        const studentIds = new Set([
            ...basicRequests.flatMap(req => req.forEligible),
            ...higherRequests.flatMap(req => req.forEligible)
        ]);

        if (studentIds.size === 0) {
            console.log("ℹ️ No new students to assign credits to.");
            return;
        }

        // 4. Fetch Student Details (We need their Section/Program to organize the ClaimRecord)
        const students = await Student.find({ studentID: { $in: Array.from(studentIds) } })
            .select('studentID section program year');

        // 5. Group Students by Section (Required for ClaimRecord Schema)
        // Map Structure: { "Grade 1 - Hope": [StudentObj, StudentObj], ... }
        const sectionMap = {};

        students.forEach(student => {
            // Determine grouping key: Section for Basic Ed, Program + Year for Higher Ed
            const groupKey = student.section || `${student.program} ${student.year}`;

            if (!sectionMap[groupKey]) {
                sectionMap[groupKey] = [];
            }

            sectionMap[groupKey].push({
                studentID: student.studentID,
                claimType: "UNCLAIMED", // Default status
                creditBalance: ALLOCATED_CREDIT, // Give them the 60 credits here
                onHandCash: 0
            });
        });

        // 6. Update Today's Claim Record
        const { start, end } = getPHDateRange();

        // Find existing record or create new one
        let dailyRecord = await ClaimRecord.findOne({
            claimDate: { $gte: start, $lte: end }
        });

        if (!dailyRecord) {
            // Create fresh if it doesn't exist (e.g., initialized logic failed or wasn't run)
            dailyRecord = new ClaimRecord({
                claimDate: start, // Use the PH start time
                claimRecords: []
            });
        }

        // Merge Logic: Insert new students into the correct sections
        Object.keys(sectionMap).forEach(sectionName => {
            const newEligibles = sectionMap[sectionName];

            // Check if section already exists in the record
            const existingSection = dailyRecord.claimRecords.find(r => r.section === sectionName);

            if (existingSection) {
                // Filter out duplicates (students already assigned)
                const existingIDs = new Set(existingSection.eligibleStudents.map(s => s.studentID));
                const uniqueToAdd = newEligibles.filter(s => !existingIDs.has(s.studentID));

                existingSection.eligibleStudents.push(...uniqueToAdd);
            } else {
                // Add new section entry
                dailyRecord.claimRecords.push({
                    section: sectionName,
                    eligibleStudents: newEligibles,
                    waivedStudents: [] // Initialize empty
                });
            }
        });

        await dailyRecord.save();
        console.log(`✅ ClaimRecord updated with ${students.length} eligible students.`);

        // 7. Mark Requests as Assigned (Lock them)
        const requestUpdatePromises = [
            ...basicRequests.map(doc => { doc.creditAssigned = true; return doc.save(); }),
            ...higherRequests.map(doc => { doc.creditAssigned = true; return doc.save(); })
        ];

        await Promise.all(requestUpdatePromises);
        console.log("✅ Eligibility requests marked as processed.");

    } catch (error) {
        console.error("❌ Error in assignCredits:", error);
        throw error; // Re-throw so scheduler knows it failed
    }
};


//Ultimate Assign Credits (Called at the hearbeat)
const syncGlobalEligibilityLogic = async (io = null) => {
    try {
        console.log("🔄 STARTING: Global Eligibility Sync...");

        // 1. Get the current meal value
        const mealValDoc = await mealValue.findOne();
        if (!mealValDoc) {
            throw new Error("No Meal Value configuration found.");
        }
        const currentMealValue = mealValDoc.mealValue;

        // 2. Define Date Components (Manila Time Context)
        const now = new Date();
        const startOfDay = new Date(now.setHours(0, 0, 0, 0));
        const endOfDay = new Date(now.setHours(23, 59, 59, 999));

        const day = now.getDate();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        // 3. Find today's ClaimRecord
        const todayRecord = await ClaimRecord.findOne({
            claimDate: { $gte: startOfDay, $lte: endOfDay }
        });

        if (!todayRecord) {
            console.log("ℹ️ No ClaimRecord found for today. Skipping sync.");
            return { success: false, reason: "No ClaimRecord" };
        }

        // 4. Aggregate Counts and Prep Updates
        let totalEligibleCount = 0;
        let totalWaivedCount = 0;
        const allStudentIDs = [];

        todayRecord.claimRecords.forEach(section => {
            totalEligibleCount += section.eligibleStudents.length;
            totalWaivedCount += section.waivedStudents.length;

            section.eligibleStudents.forEach(student => {
                student.creditBalance = currentMealValue;
                allStudentIDs.push(student.studentID);
            });
        });

        // 5. Update Database Models
        // A. Save today's transaction log
        await todayRecord.save();

        // B. Update Student profiles in bulk
        const studentUpdate = await Student.updateMany(
            { studentID: { $in: allStudentIDs } },
            {
                $set: {
                    temporaryCreditBalance: currentMealValue,
                    temporaryClaimStatus: "ELIGIBLE"
                }
            }
        );

        // C. Update the Daily Report Dashboard
        const totalAllotted = currentMealValue * totalEligibleCount;
        const reportUpdate = await Report.findOneAndUpdate(
            { day, month, year },
            {
                $set: {
                    "stats.eligibleStudentCount": totalEligibleCount,
                    "stats.waivedStudentCount": totalWaivedCount,
                    "financials.totalAlottedCtredits": totalAllotted
                }
            },
            { new: true }
        );

        // 6. Socket Notification (Optional)
        if (io) {
            io.emit('sync-complete', {
                message: 'Eligibility and Credits Synced',
                mealValue: currentMealValue
            });
        }

        console.log(`✅ SYNC SUCCESS: ${totalEligibleCount} students funded with ₱${currentMealValue}.`);

        return {
            success: true,
            fundedCount: totalEligibleCount,
            budget: totalAllotted
        };

    } catch (error) {
        console.error("❌ ERROR in syncGlobalEligibilityLogic:", error.message);
        throw error;
    }
};

const assignCreditsForEvents = async () => {
    const now = new Date();
    const dateToday = now.getDate(); // day of the month (1-31)

    const approvedEvents = await event.find({ status: 'APPROVED' });

    for (const ev of approvedEvents) {
        // Make sure to use ev.startDay and ev.endDay (as string, convert to number for comparison)
        // You may also want to check the month or year, if needed.
        const startDay = parseInt(ev.startDay, 10);
        const endDay = parseInt(ev.endDay, 10);

        if (dateToday >= startDay && dateToday <= endDay) {
            // Eligible sections
            const approvedSections = ev.forEligibleSection; // e.g., ['Romans', 'Galatians']

            // Eligible programs and year - array of objects
            const approvedProgramsAndYears = ev.forEligibleProgramsAndYear; // e.g., [{program: 'BSCS', year: '2'}, ...]

            // Waived students for today
            const temporarilyWaivedStudents = ev.forTemporarilyWaived; // e.g., ['johndoe123', 'janedoe456']

            // Query to find students meeting the event eligibility
            // Example: Find students in eligible sections and/or programs/year, and not in waived list
            const query = {
                $or: [
                    { section: { $in: approvedSections } },
                    ...approvedProgramsAndYears.map(pair => ({
                        program: pair.program,
                        year: pair.year
                    }))
                ],
                studentID: { $nin: temporarilyWaivedStudents }
            };

            const eligibleStudents = await Student.find(query);

            // Assign credits to all those students
            const credit = await Credit.findOne({});
            const updatedStudents = [];

            for (const student of eligibleStudents) {
                student.creditValue = credit.creditValue;
                await student.save();
                await logClaimAttempt(student.studentID, 'ASSIGN-CREDIT', credit.creditValue);
                updatedStudents.push({
                    studentID: student.studentID,
                    creditValue: student.creditValue
                });
            }

            console.log(`✅ Assigned credits for event '${ev.eventName}' (${ev.eventID}) - ${updatedStudents.length} students`);
            // You can return or handle updatedStudents as needed
        }
    }
};
// =========================================================
// 🟢 FAKE MEAL CLAIM (With Logger)
// =========================================================
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
    removeCredits,
    assignCredits,
    assignCreditsForEvents,
    fakeMealClaim,
    fakeFoodItemClaim,
    getApprovedStudentsToday,
    syncGlobalEligibilityLogic //called at the hearbeat
} 
