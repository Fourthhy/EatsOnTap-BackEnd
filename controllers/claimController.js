// FIX 2: Import the safe logging wrapper function from loggerController.js
import { logClaimAttempt } from "./loggerController.js";
import Student from "../models/student.js";
import Setting from "../models/setting.js";
import Credit from "../models/credit.js";
import eligibilityBasicEd from "../models/eligibilityBasicEd.js";
import eligibilityHigherEd from "../models/eligibilityHigherEd.js";

// This controller handles all the claim attempts done by the students monitored by respective user roles such as FOOD-SERVER and CANTEEN-STAFF

// Update mealEligibilityStatus to "Claimed"
const claimMeal = async (req, res, next) => {
    try {
        // searching for the student
        const student = await Student.findOne({ studentID: req.params.studentID });

        const claimSetting = await Setting.findOne({ settingName: 'STUDENT-CLAIM' })
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
const assignCredits = async () => {
    const credit = await Credit.findOne({});

    if (!credit) {
        throw new Error("Credit value not found");
    }

    const eligibilityListBasicEd = await eligibilityBasicEd.find(
        { status: 'APPROVED' },
        { creditAssigned: false }
    );
    const eligibilityListHigherEd = await eligibilityHigherEd.find(
        { status: 'APPROVED' },
        { creditAssigned: false }
    );

    const studentIds = [
        ...eligibilityListBasicEd.flatMap(item => item.forEligible),
        ...eligibilityListHigherEd.flatMap(item => item.forEligible)
    ];
    const uniqueStudentIds = Array.from(new Set(studentIds));

    // Now fetch full student docs
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
    eligibilityListBasicEd.creditAssigned = true;
    eligibilityListBasicEd.save();
    
    eligibilityListHigherEd.creditAssigned = true;
    eligibilityListHigherEd.save();
    return updatedStudents;
}

/* New function to deduct remaining credits 
This function is created and aligned to "Prevent Carry-over unused credit balance and auto reset of credits"
*/

export {
    claimMeal,
    claimFood,
    deductCredits,
    removeCredits,
    assignCredits
} 
