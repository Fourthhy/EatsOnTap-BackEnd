import user from '../models/user.js';
import classAdviser from '../models/classAdviser.js';
import eligibilityBasicEd from '../models/eligibilityBasicEd.js'
import eligibilityHigherEd from '../models/eligibilityHigherEd.js';
import student from '../models/student.js'
import mealValue from '../models/mealValue.js';
import Setting from '../models/setting.js'



const getStudentIDsBySection = async (section) => {
    if (!section) {
        throw new Error("Section parameter is required to fetch student IDs");
    }

    const allStudentIDsInSection = await student.find(
        { section: section },
        { studentID: 1, _id: 0 })

    const allStudentIDs = allStudentIDsInSection.map(student => student.studentID);
    return allStudentIDs;
}

const getStudentIDsByProgramAndYear = async (program, year) => {
    if (!program || !year) {
        throw new Error("Both program and year parameters need to be filled");
    }

    const allStudentIDsByProgramAndYear = await student.find({
        program: program,
        year: year
    })

    const allStudentIDs = allStudentIDsByProgramAndYear.map(s => s.studentID);

    return allStudentIDs;
}

const submitDailyMealRequestList = async (req, res, next) => {
    try {
        // 🟢 UPDATE 1: Accept forAbsentStudentIDs from the request
        const { requesterID, section, forEligibleStudentIDs, forAbsentStudentIDs } = req.body;

        const submitSetting = await Setting.findOne({ setting: 'SUBMIT-MEAL-REQUEST' });
        if (!submitSetting) {
            return res.status(400).json({ message: "Setting not found" });
        }
        if (submitSetting.isActive === false) {
            return res.status(400).json({ message: "Setting is not on schedule, please wait for it to be active" });
        }
        
        // Validation
        if (!requesterID) return res.status(400).json({ message: "Missing required field: requesterID" });
        if (!section) return res.status(400).json({ message: "Missing required field: section" });
        if (!Array.isArray(forEligibleStudentIDs)) return res.status(400).json({ message: "Missing/Invalid field: forEligibleStudentIDs" });
        
        // 🟢 UPDATE 2: Validate forAbsentStudentIDs (Default to empty array if missing)
        const absentIDs = Array.isArray(forAbsentStudentIDs) ? forAbsentStudentIDs : [];

        const adviser = await classAdviser.findOne({ userID: requesterID, section: section });
        if (!adviser) {
            return res.status(404).json({ message: `Authorization failed. Class adviser is not for ${section} section` });
        }

        // Extracts all student IDs by section
        const allStudentIDs = await getStudentIDsBySection(section);

        // Check if the students in the section exist
        // 🟢 FIX: Fixed typo 'lenght' and logic
        if (allStudentIDs.length === 0) {
            return res.status(404).json({ message: `No student available in ${section} section` });
        }

        // Fetch the full list of students to determine default eligibility status
        const allStudents = await student.find({ studentID: { $in: allStudentIDs } });

        // Identify students who are permanently waived (e.g. bring their own lunch everyday)
        // Note: Ensure 'mealEligibilityStatus' matches your Student model field (e.g., might be 'temporaryClaimStatus' depending on your schema)
        const waivedByDefault = new Set(
            allStudents
                .filter(student => student.mealEligibilityStatus === 'WAIVED') 
                .map(student => student.studentID)
        );

        // 🟢 UPDATE 3: Calculation Logic
        const eligibleSet = new Set(forEligibleStudentIDs);
        const absentSet = new Set(absentIDs);

        // Logic for Temporarily Waived: 
        // Students in the section WHO ARE NOT (Eligible OR Absent OR Permanently Waived)
        const forTemporarilyWaived = allStudentIDs.filter(studentID =>
            !eligibleSet.has(studentID) && 
            !waivedByDefault.has(studentID) &&
            !absentSet.has(studentID) // Exclude absent students from being counted as waived
        );

        // Sanity Check: Ensure 'Eligible' list doesn't contain permanently waived students
        const forEligible = forEligibleStudentIDs.filter(studentID => !waivedByDefault.has(studentID));

        // Generate ID
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

        const newEligibilityListing = new eligibilityBasicEd({
            eligibilityID: `${requesterID}-${section}-${dateStr}`,
            requester: requesterID,
            section: section,
            forEligible: forEligible,
            forTemporarilyWaived: forTemporarilyWaived,
            forAbsentStudents: absentIDs, // 🟢 UPDATE 4: Save the absent list
            creditAssigned: false // Explicit default
        });

        await newEligibilityListing.save();

        // Socket emission
        const io = req.app.get('socketio');
        if (io) {
            io.emit('meal-request-submit', { type: 'Basic Education' });
            console.log('Socket Emitted: meal-request-submit: Basic Education');
        }

        // Success response
        res.status(201).json({
            message: `Meal Recipient list submitted for ${section} section`,
            totalStudents: allStudentIDs.length,
            eligibleCount: forEligible.length,
            waivedCount: forTemporarilyWaived.length,
            absentCount: absentIDs.length, // Useful for frontend confirmation
            data: newEligibilityListing
        });

    } catch (error) {
        console.error("Error submitting meal request list: ", error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        next(error);
    }
};
// Assuming imports for user, eligibilityBasicEd, and student are defined globally/locally
// And that getStudentIDsByProgramAndYear is available and returns a Promise<string[]>

const submitScheduledMealRequestList = async (req, res, next) => {
    try {
        // Removed forEligibleStudentIDs from destructuring
        const { requesterID, program, year, dayOfWeek } = req.body;

        // --- 1. Input Validation ---
        // Simplified validation: No need to check for Array.isArray
        if (!requesterID || !program || !year || !dayOfWeek) {
            return res.status(400).json({ message: "Missing required fields (requesterID, program, year, or dayOfWeek)." });
        }

        // --- 2. Authorization Check ---
        const adminAssistant = await user.findOne({ userID: requesterID, role: 'ADMIN-ASSISTANT' });
        if (!adminAssistant) {
            return res.status(403).json({ message: "Authorization failed. Account is not a registered Admin Assistant." });
        }

        // --- 3. Extract All Student IDs ---
        const allStudentIDs = await getStudentIDsByProgramAndYear(program, year);

        // --- 4. Check for Students ---
        if (allStudentIDs.length === 0) {
            return res.status(404).json({ message: `No student available in ${program} program, in the year: ${year}` });
        }

        // Fetch the full list of students to determine default eligibility status
        const allStudents = await student.find({ studentID: { $in: allStudentIDs } });

        // Waived by Default (Students who are permanently excluded from eligibility)
        const waivedByDefault = new Set(
            allStudents
                .filter(s => s.mealEligibilityStatus === 'WAIVED')
                .map(s => s.studentID)
        );

        // --- CRITICAL LOGIC CHANGE ---
        // 5. Determine Eligible Students: All students who are NOT waived by default.
        const forEligible = allStudentIDs.filter(studentID =>
            !waivedByDefault.has(studentID)
        );

        // 6. Waived Students: Only the permanent waivers (if the eligibility model requires both fields, otherwise this should be an empty array).
        // Since all non-waived students are eligible, the temporary waiver list is empty.
        const forWaived = []; // No temporary waivers are processed/submitted in this simplified model.

        // --- 7. Create and Save Listing ---
        const newEligibilityListing = new eligibilityHigherEd({
            eligibilityID: `${requesterID}-${program}-${year}`,
            requester: requesterID,
            program: program,
            year: year,
            forEligible: forEligible,
            forWaived: forWaived, // Passed as an empty array
            forDay: dayOfWeek
        });

        await newEligibilityListing.save();

        // --- 8. Success Response ---
        res.status(201).json({
            message: `Scheduled meal list submitted for ${program}, in the year ${year} for ${dayOfWeek}. ${forEligible.length} students are deemed eligible by default.`,
            eligibilityID: `${requesterID}-${program}-${year}`,
            totalStudents: allStudentIDs.length,
            eligibleCount: forEligible.length,
            waivedCount: forWaived.length, // This will now be 0
            data: newEligibilityListing
        });

    } catch (error) {
        console.error("Error submitting scheduled meal request list: ", error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        next(error)
    }
}

const fetchDailyRequestsBySection = async (req, res, next) => {
    try {
        const { section } = req.params;

        // 1. Get Current "Wall Clock" Date Components in Manila
        // We extract the specific Day, Month, and Year in the Philippines right now.
        const now = new Date();
        const options = { timeZone: "Asia/Manila", year: 'numeric', month: 'numeric', day: 'numeric' };

        // This gives us a string like "1/5/2026" regardless of where the server is
        const phDateString = now.toLocaleDateString("en-US", options);

        // Parse the components
        const [month, day, year] = phDateString.split('/').map(num => parseInt(num));

        // 2. Construct the Query Range in UTC
        // A. Start with 00:00 UTC on that specific date
        // B. Subtract 8 hours (28800000ms) to align with Philippines Midnight (GMT+8)
        // Note: Month is 0-indexed in Javascript Date (0 = Jan, 11 = Dec)
        const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

        const startOfDayVal = Date.UTC(year, month - 1, day) - PH_OFFSET_MS;
        const endOfDayVal = startOfDayVal + (24 * 60 * 60 * 1000) - 1;

        const startOfDay = new Date(startOfDayVal);
        const endOfDay = new Date(endOfDayVal);

        // Debug: This should now show the correct UTC equivalents (e.g., 16:00 prev day)
        // console.log(`Searching for PH Date: ${phDateString}`);
        // console.log(`Query Range (UTC): ${startOfDay.toISOString()} - ${endOfDay.toISOString()}`);

        // 3. Run the Query
        const existingRecord = await eligibilityBasicEd.findOne({
            section: section,
            timeStamp: {
                $gte: startOfDay,
                $lte: endOfDay
            }
        });

        const jsonResponse = {
            isSubmitted: !!existingRecord, // shorthand for existingRecord ? true : false
            existingRecord
        };

        res.status(200).json(jsonResponse);

    } catch (error) {
        next(error);
    }
}

const claimStatusReset = async (req, res, next) => {
    try {
        // 1. Get the current Global Meal Value
        // We assume there is only one document in this collection
        const globalValue = await mealValue.findOne({});

        if (!globalValue) {
            return res.status(500).json({ message: "Error: No Meal Value configured in system." });
        }

        const valueToAssign = globalValue.mealValue;

        // 2. Update ALL students:
        // - Set status to ELIGIBLE
        // - Set their balance to the fetched mealValue
        const result = await student.updateMany(
            {},
            {
                $set: {
                    temporaryClaimStatus: "ELIGIBLE",
                    temporaryCreditBalance: valueToAssign // 👈 Copied from other model
                }
            }
        );

        res.status(200).json({
            message: `Reset complete. All students set to ELIGIBLE with ${valueToAssign} credits.`,
            modifiedCount: result.modifiedCount
        });

    } catch (error) {
        next(error);
    }
};

//when admin approved the request, create a function that will scan the status of an meal eligibiltity request (scheduled and note scheduled). if APPROVED, create a function that will "mass eligible" and "mass waive" the students from the eligibility list.

//for basic education, the function has a parameter of the class adviser's ID, which naturally prevents them to submit another list, the class adviser's ID will act as the eligiblity ID of the list they submitted.

/* for higher education, the function has a parameter of the admin-assistant's ID, followed by program and year that is hyperated.
e.g. 22-000111aaa-BSIS-2
that will server as the eligibility ID of the list they submitted.

*/


export {
    submitDailyMealRequestList,
    submitScheduledMealRequestList,
    fetchDailyRequestsBySection,
    getStudentIDsBySection,
    claimStatusReset
}