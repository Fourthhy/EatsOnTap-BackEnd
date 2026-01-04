//this controller will be removed before the handover, as it is just tools for the developer

import Student from "../models/student.js";

const removeClaimDetails = async (req, res, next) => {
    try {
        await Student.updateMany({}, { $unset: { mealEligibilityStatus: "" } });
        console.log("Successfully removed 'yearServed' from all users.")
    } catch (error) {
        next(error)
    }
}

export {
    removeClaimDetails
}