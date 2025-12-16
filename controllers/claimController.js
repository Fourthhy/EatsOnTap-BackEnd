// FIX 2: Import the safe logging wrapper function from loggerController.js
import { logClaimAttempt } from "./loggerController.js";
import Student from "../models/student.js";
import Setting from "../models/setting.js";
import Credit from "../models/credit.js";
import event from "../models/event.js";
import eligibilityBasicEd from "../models/eligibilityBasicEd.js";
import eligibilityHigherEd from "../models/eligibilityHigherEd.js";

// This controller handles all the claim attempts done by the students monitored by respective user roles such as FOOD-SERVER and CANTEEN-STAFF

// Update mealEligibilityStatus to "Claimed"
const claimMeal = async (req, res, next) => {
    try {
        // searching for the student

        const { studentInput } = req.body;
        const hyphenRegex = /-/;
        // 1. Determine the key to search by
        const searchKey = hyphenRegex.test(studentInput) ? 'studentID' : 'rfidTag';

        // 2. Perform the search once
        const student = await Student.findOne({
            [searchKey]: studentInput
        });

        const claimSetting = await Setting.findOne({ setting: 'STUDENT-CLAIM' })
        if (!claimSetting) {
            res.status(400).json({ message: "Setting not found" });
        }
        if (claimSetting.settingEnable === false) {
            res.status(400).json({ message: "Setting is not active, please turn it on" });
        }
        if (claimSetting.settingActive === false) {
            res.status(400).json({ message: "Setting is not on scheduled, please wait for it to be active" })
        }

        // if student does not exist, it will return an error message
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
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
                // FIX 3: Use 409 Conflict (Resource state prevents action)
                return res.status(409).json({ message: 'Student is already claimed!' });
            case 'INELIGIBLE':
                // FIX 1: Use await and safe logger wrapper
                await logClaimAttempt(student.studentID, 'CLAIM-ATTEMPT-INELIGIBLE', 0)
                // FIX 3: Use 400 Bad Request
                return res.status(400).json({ message: 'Student is Ineligible' });
            case 'ELIGIBLE':
                // check if there is sufficient balance
                if (student.creditValue !== 60) {
                    // FIX 1: Use await and safe logger wrapper
                    await logClaimAttempt(student.studentID, 'CLAIM-ATTEMPT-INSUFFICIENT-BALANCE', 0)
                    // FIX 3: Use 400 Bad Request
                    return res.status(400).json({ message: "Insufficient Balance! Requires 60 credits for a meal." });
                }

                // Updating student record 
                student.mealEligibilityStatus = 'CLAIMED';
                student.creditValue = 0;
                await student.save();

                // FIX 1: Use await and safe logger wrapper
                await logClaimAttempt(student.studentID, 'CLAIM-FREE-MEAL', 60)

                // Display the required information
                const responseData = {
                    studentID: student.studentID,
                    Name: student.name,
                    Course: student.course,
                    mealEligibilityStatus: student.mealEligibilityStatus,
                    creditValue: student.creditValue
                };
                return res.json(responseData);
        }
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

//new function to assign creditValue to student
const assignCredits = async (dayToday) => {
    const credit = await Credit.findOne({});
    if (!credit) throw new Error("Credit value not found");

    const eligibilityListBasicEduc = await eligibilityBasicEd.find(
        { status: 'APPROVED', creditAssigned: false } // all as filter
    );
    const eligibilityListHigherEduc = await eligibilityHigherEd.find(
        { status: 'APPROVED', creditAssigned: false, forDay: dayToday } // all as filter
    );

    const studentIds = [
        ...eligibilityListBasicEduc.flatMap(item => item.forEligible),
        ...eligibilityListHigherEduc.flatMap(item => item.forEligible)
    ];
    console.log(eligibilityListHigherEduc.map(doc => doc.forEligible));

    const uniqueStudentIds = Array.from(new Set(studentIds));

    // Fetch full student docs
    const students = await Student.find({ studentID: { $in: uniqueStudentIds } });

    const updatedStudents = [];
    for (const student of students) {
        student.creditValue = credit.creditValue;
        await student.save();
        await logClaimAttempt(student.studentID, 'ASSIGN-CREDIT', credit.creditValue);
        updatedStudents.push({
            student: student.studentID,
            creditValue: student.creditValue
        });
    }

    // Correct: Loop through each doc and mark as assigned
    for (const doc of eligibilityListBasicEduc) {
        doc.creditAssigned = true;
        await doc.save();
    }
    for (const doc of eligibilityListHigherEduc) {
        doc.creditAssigned = true;
        await doc.save();
    }
    return updatedStudents;
}

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



/* New function to deduct remaining credits 
This function is created and aligned to "Prevent Carry-over unused credit balance and auto reset of credits"
*/

export {
    claimMeal,
    claimFood,
    deductCredits,
    removeCredits,
    assignCredits,
    assignCreditsForEvents
} 
