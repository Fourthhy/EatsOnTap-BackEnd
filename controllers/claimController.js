// FIX 2: Import the safe logging wrapper function from loggerController.js
import { logClaimAttempt } from "./loggerController.js";
import Student from "../models/student.js";
import Setting from "../models/setting.js";
import Credit from "../models/credit.js";
import event from "../models/event.js";
import eligibilityBasicEd from "../models/eligibilityBasicEd.js";
import eligibilityHigherEd from "../models/eligibilityHigherEd.js";
import ClaimRecord from "../models/claimRecord.js";

// 🟢 HELPER: Get PH Date Range (To ensure we hit the right daily record)
const getPHDateRange = () => {
    const now = new Date();
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

const claimMeal = async (req, res, next) => {
    try {
        const { studentInput } = req.body;

        // A. Resolve Search Key (Student ID vs RFID)
        const hyphenRegex = /-/;
        const searchKey = hyphenRegex.test(studentInput) ? 'studentID' : 'rfidTag';

        // B. Check Setting Permission
        const claimSetting = await Setting.findOne({ setting: 'STUDENT-CLAIM' });
        if (!claimSetting) {
            return res.status(500).json({ message: "System Error: 'STUDENT-CLAIM' setting is missing." });
        }
        if (claimSetting.isActive === false) {
            return res.status(403).json({ message: "Meal claiming is not active at this scheduled time." });
        }

        // C. Find the Student (Base Model)
        const student = await Student.findOne({ [searchKey]: studentInput });
        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }

        // =========================================================
        // 2. FETCH REFERENCE DATA (Price & Daily Record)
        // =========================================================

        // A. Get the Cost of a Meal (Dynamic, not hardcoded)
        const creditModel = await Credit.findOne();
        const MEAL_COST = creditModel ? creditModel.creditValue : 60; // Fallback to 60 if DB is empty, but uses DB value primarily

        // B. Get Today's Claim Record
        const { start, end } = getPHDateRange();
        const dailyRecord = await ClaimRecord.findOne({
            claimDate: { $gte: start, $lte: end }
        });

        if (!dailyRecord) {
            return res.status(404).json({ message: "No claim record found for today. Has the day initialized?" });
        }

        // =========================================================
        // 3. ELIGIBILITY & BALANCE CHECK (Inside ClaimRecord)
        // =========================================================

        // We need to find which section the student belongs to in the daily record
        let foundStudentSectionIndex = -1; //ANO TO
        let foundStudentIndex = -1;
        let eligibleStudentData = null;

        // Loop through sections to find the student
        for (let i = 0; i < dailyRecord.claimRecords.length; i++) {
            const sectionRecord = dailyRecord.claimRecords[i];
            const sIndex = sectionRecord.eligibleStudents.findIndex(s => s.studentID === student.studentID);

            if (sIndex !== -1) {
                foundStudentSectionIndex = i;
                foundStudentIndex = sIndex;
                eligibleStudentData = sectionRecord.eligibleStudents[sIndex];
                break;
            }
        }

        // CASE 1: Student NOT in eligible list (Waived, Absent, or Ineligible)
        if (!eligibleStudentData) {
            // await logClaimAttempt(student.studentID, 'CLAIM-ATTEMPT-INELIGIBLE', 0);
            return res.status(400).json({ message: "Student is not in the eligible list for today (Waived or Ineligible)." });
        }

        // CASE 2: Already Claimed / Insufficient Balance
        // We check if their current balance is less than the cost of a meal
        if (eligibleStudentData.creditBalance < MEAL_COST) {
            // await logClaimAttempt(student.studentID, 'CLAIM-ATTEMPT-INSUFFICIENT', 0);

            if (eligibleStudentData.creditBalance === 0) {
                return res.status(409).json({ message: "Student has already claimed their meal!" });
            } else {
                return res.status(400).json({ message: `Insufficient balance! Balance: ${eligibleStudentData.creditBalance}, Required: ${MEAL_COST}` });
            }
        }

        // =========================================================
        // 4. EXECUTE UPDATES
        // =========================================================

        // UPDATE 1: ClaimRecord Model
        // Change Type to MEAL-CLAIM and Zero out the balance
        const claimRecordUpdatePath = `claimRecords.${foundStudentSectionIndex}.eligibleStudents.${foundStudentIndex}`;

        await ClaimRecord.updateOne(
            { _id: dailyRecord._id },
            {
                $set: {
                    [`${claimRecordUpdatePath}.claimType`]: "MEAL-CLAIM",
                    [`${claimRecordUpdatePath}.creditBalance`]: 0 // Consumed
                    // onHandCash remains untouched as requested
                }
            }
        );

        // UPDATE 2: Student Model (History Log)
        // Update the item in the array that matches today's date
        await Student.updateOne(
            {
                studentID: student.studentID,
                "claimRecords.date": { $gte: start, $lte: end }
            },
            {
                $set: {
                    "claimRecords.$.creditClaimed": MEAL_COST,
                    "claimRecords.$.remarks": ["CLAIMED"]
                }
            }
        );

        // =========================================================
        // 5. SUCCESS RESPONSE
        // =========================================================

        // await logClaimAttempt(student.studentID, 'CLAIM-SUCCESS-MEAL', MEAL_COST);

        return res.status(200).json({
            message: "Meal claimed successfully!",
            data: {
                studentID: student.studentID,
                name: `${student.first_name} ${student.last_name}`,
                program: student.program || student.section,
                status: "CLAIMED",
                creditsConsumed: MEAL_COST,
                remainingBalance: 0
            }
        });

    } catch (error) {
        next(error);
    }
};

const claimFood = async (req, res, next) => {
    try {
        // searching for the student
        const student = await Student.findOne({ studentID: req.params.studentID });

        const claimSetting = await Setting.findOne({ settingName: 'STUDENT-CLAIM' })
        if (!claimSetting) {
            res.status(400).json({ message: "Setting not found" });
        }
        if (claimSetting.settingEnable === false) {
            res.status(400).json({ message: "Setting is not enabled, please turn it on" });
        }
        if (claimSetting.settingActive === false) {
            res.status(400).json({ message: "Setting is not on scheduled, please wait for it to be active" })
        }

        // if student does not exist, it will return an error message
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const { creditTaken } = req.body;

        // Basic input validation
        if (typeof creditTaken !== 'number' || creditTaken <= 0) {
            return res.status(400).json({ message: 'Invalid creditTaken value. Must be a positive number.' });
        }


        switch (student.mealEligibilityStatus) {
            case 'WAIVED':
                // FIX 1: Use await and safe logger wrapper
                await logClaimAttempt(student.studentID, 'CLAIM-ATTEMPT-WAIVED', 0);
                // FIX 3: Use 400 Bad Request
                return res.status(400).json({ message: 'Student is currently Waived!' });
            case 'CLAIMED':
                // FIX 1: Use await and safe logger wrapper
                await logClaimAttempt(student.studentID, 'CLAIM-ATTEMPT-CLAIMED', 0);
                // FIX 3: Use 409 Conflict
                return res.status(409).json({ message: 'Student is already claimed (Full meal taken)!' });
            case 'INELIGIBLE':
                // FIX 1: Use await and safe logger wrapper
                await logClaimAttempt(student.studentID, 'CLAIM-ATTEMPT-INELIGIBLE', 0)
                // FIX 3: Use 400 Bad Request
                return res.status(400).json({ message: 'Student is Ineligible' });
            case 'ELIGIBLE':
                // check if the balance is not 0
                if (student.creditValue === 0) {
                    // FIX 1: Use await and safe logger wrapper
                    await logClaimAttempt(student.studentID, 'CLAIM-ATTEMPT-NO-BALANCE', 0);
                    // FIX 3: Use 400 Bad Request
                    return res.status(400).json({ message: "No Balance" });
                }


                // checking if the credit taken is greater than the current credit value
                if (creditTaken > student.creditValue) {
                    // FIX 1: Use await and safe logger wrapper
                    await logClaimAttempt(student.studentID, 'CLAIM-ATTEMPT-INSUFFICIENT-BALANCE', 0)
                    // FIX 3: Use 400 Bad Request
                    return res.status(400).json({ message: "Insufficient balance!" });
                }

                // checking if there is any balance left
                const creditChange = student.creditValue - creditTaken;

                // if there isn't credit left, the student will be deemed "Claimed"
                if (creditChange === 0) {
                    student.mealEligibilityStatus = "CLAIMED";
                }

                // Updating student record 
                student.creditValue = creditChange;
                await student.save();

                // FIX 1: Use await and safe logger wrapper
                await logClaimAttempt(student.studentID, 'CLAIM-FOOD-ITEM', creditTaken)


                // Display the required information
                const responseData = {
                    studentID: student.studentID,
                    Name: student.last_name,
                    Course: student.course,
                    mealEligibilityStatus: student.mealEligibilityStatus,
                    creditValue: student.creditValue
                };
                return res.json(responseData);
        }

    } catch (error) {
        next(error)
    }
}

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
const fakeMealClaim = async (req, res, next) => {
    try {
        // 🟢 CHANGE: Use req.query for GET requests
        const { studentInput } = req.query;

        if (!studentInput) {
            return res.status(400).json({ message: "Please provide a Student ID or RFID Tag." });
        }

        // Search for a student matching EITHER the studentID OR the rfidTag
        const student = await Student.findOne({
            $or: [
                { studentID: studentInput },
                { rfidTag: studentInput }
            ]
        });

        if (!student) {
            return res.status(404).json({ message: "Student not found." });
        }
        // Return the student data
        res.status(200).json(student);
        student.temporaryClaimStatus[0] = "CLAIMED";
        await student.save();

    } catch (error) {
        next(error);
    }
};

const fakeFoodItemClaim = async (req, res, next) => {
    try {
        // Expecting JSON body: { "studentInput": "25-00025", "amount": 50 }
        const { studentInput, amount } = req.body;

        // 1. Validation
        if (!studentInput) {
            return res.status(400).json({ message: "Please provide a Student ID or RFID Tag." });
        }
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ message: "Please provide a valid positive amount to deduct." });
        }

        // 2. Find the student (by ID or RFID)
        const student = await Student.findOne({
            $or: [
                { studentID: studentInput },
                { rfidTag: studentInput }
            ]
        });

        if (!student) {
            return res.status(404).json({ message: "Student not found." });
        }

        // 3. Check for Sufficient Balance
        if (student.temporaryCreditBalance < amount) {
            return res.status(400).json({
                message: "Transaction Failed: Insufficient Balance",
                currentBalance: student.temporaryCreditBalance,
                attemptedAmount: amount
            });
        }

        // 4. Deduct Balance
        student.temporaryCreditBalance -= amount;

        // 5. Update Status (Optional but recommended logic)
        // If balance hits 0, you might want to mark them as NO-BALANCE
        if (student.temporaryCreditBalance === 0) {
            // Check if "NO-BALANCE" is in the array, if not, add/set it
            if (!student.temporaryClaimStatus.includes("NO-BALANCE")) {
                student.temporaryClaimStatus = ["NO-BALANCE"];
            }
        }

        // 6. Save & Respond
        await student.save();

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

/* New function to deduct remaining credits 
This function is created and aligned to "Prevent Carry-over unused credit balance and auto reset of credits"
*/

export {
    claimMeal,
    claimFood,
    deductCredits,
    removeCredits,
    assignCredits,
    assignCreditsForEvents,
    fakeMealClaim,
    fakeFoodItemClaim
} 
