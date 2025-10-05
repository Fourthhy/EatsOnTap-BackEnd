// FIX 2: Import the safe logging wrapper function from loggerController.js
import { logClaimAttempt } from "./loggerController.js";
import Student from "../models/student.js";

// This controller handles all the claim attempts done by the students monitored by respective user roles such as FOOD-SERVER and CANTEEN-STAFF

// Update mealEligibilityStatus to "Claimed"
const claimMeal = async (req, res, next) => {
    try {
        // searching for the student
        const student = await Student.findOne({ studentID: req.params.studentID });

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

const deductRemainingCredits = async (req, res, next) => {
    try {
        //checking if the student exist
        const student = await Student.findOne({ studentID: req.params.studentID });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        //checking if there is remaining balance
        if (student.creditValue == 0) {
            return res.status(200).json({message: "student has no remaining balance"})
        }
        await logClaimAttempt(student.studentID, 'REMOVED-UNUSED-BALANCE', student.creditValue);
            student.creditValue = 0;
            student.mealEligibilityStatus = 'Ineligible'
            await student.save();

            const responseData = {
                studentID: student.studentID,
                Name: student.name,
                Course: student.course,
                mealEligibilityStatus: student.mealEligibilityStatus,
                creditValue: student.creditValue // Display the new creditValue
            };
            res.status(201).json(responseData);
        // Display the updated student information

    } catch (error) {
        next(error);
    }
};

//new function to assign creditValue to student
const assignCreditValue = async (req, res, next) => {
    // const assignedCredit = 60;

    const { assignedCredit }  = req.body;
    try {
        const student = await Student.findOne({ studentID: req.params.studentID });

        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        if (student.creditValue !== 0) {
            return res.status(409).json({ message: "Student already has credit value" });
        }

        student.creditValue = assignedCredit;
        await student.save();

        // FIX 4: Added logging
        await logClaimAttempt(student.studentID, 'ASSIGN-CREDIT', assignedCredit);

        const responseData = {
            studentID: student.studentID,
            last_name: student.last_name,
            creditValue: student.creditValue // Display the new creditValue
        };
        res.status(200).json(responseData);

    } catch (error) {
        next(error);
    }
}

/* New function to deduct remaining credits 
This function is created and aligned to "Prevent Carry-over unused credit balance and auto reset of credits"
*/


export {
    claimMeal,
    claimFood,
    deductCredits,
    deductRemainingCredits,
    assignCreditValue
} 
