import user from '../models/user.js';
import classAdviser from '../models/classAdviser.js';
import eligibilityBasicEd from '../models/eligibilityBasicEd.js'
import eligibilityHigherEd from '../models/eligibilityHigherEd.js';
import student from '../models/student.js'
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
        const { requesterID, section, forEligibleStudentIDs } = req.body;

        const submitSetting = await Setting.findOne({ setting: 'SUBMIT-MEAL-REQUEST' })
        if (!submitSetting) {
            return res.status(400).json({ message: "Setting not found" });
        }
        if (submitSetting.settingEnable === false) {
            return res.status(400).json({ message: "Setting is not enabled, please turn it on" });
        }
        if (submitSetting.settingActive === false) {
            return res.status(400).json({ message: "Setting is not on scheduled, please wait for it to be active" })
        }
        //check and validate fields
        if (!requesterID) {
            return res.status(400).json({ message: "Missing required field: requesterID" })
        }

        if (!section) {
            return res.status(400).json({ message: "Missing required field: section" })
        }

        if (!Array.isArray(forEligibleStudentIDs)) {
            return res.status(400).json({ message: "Missing required field: forEligibleStudentIDs" })
        }

        //check if the classadviser accessing is the current section adviser (OPTIONAL but for safety)
        const adviser = await classAdviser.findOne({ userID: requesterID, section: section });
        if (!adviser) {
            return res.status(404).json({ message: `Authorization failed. Class adviser is not for ${section} section` })
        }

        //extracts all student IDs by section
        const allStudentIDs = await getStudentIDsBySection(section)

        //check if the students in the section exist
        if (!allStudentIDs.lenght === 0) {
            return res.status(404).json({ message: `No student available in ${section} section` });
        }

        //Fetch the full list of students within that section to determine default eligibliity status
        const allStudents = await student.find({ studentID: { $in: allStudentIDs } });

        const waivedByDefault = new Set(
            allStudents
                .filter(student => student.mealEligibilityStatus === 'WAIVED')
                .map(student => student.studentID)
        )

        //Determine temporarily waived students (those are exempted from the given list)
        const eligibleSet = new Set(forEligibleStudentIDs);

        const forTemporarilyWaived = allStudentIDs.filter(studentID =>
            !eligibleSet.has(studentID) && !waivedByDefault.has(studentID)
        )

        const forEligible = forEligibleStudentIDs.filter(studentID => !waivedByDefault.has(studentID));

        const newEligibilityListing = new eligibilityBasicEd({
            eligibilityID: `${requesterID}-${section}`,
            requester: requesterID,
            section: section,
            forEligible: forEligible,
            forTemporarilyWaived: forTemporarilyWaived
        })

        await newEligibilityListing.save()

        //success response
        res.status(201).json({
            message: `Meal Recepient list submitted for ${section} section`,
            totalStudents: allStudentIDs.length,
            eligibleCount: forEligible.length,
            waivedCount: forTemporarilyWaived.length,
            data: newEligibilityListing
        })
    } catch (error) {
        console.error("Error submitting meal request list: ", error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        next(error)
    }

}
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

        // 1. Get the time range for "Today"
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        // 2. Check existence using 'timeStamp' (MATCHING YOUR SCHEMA)
        const existingRecord = await eligibilityBasicEd.findOne({
            section: section,
            timeStamp: {
                $gte: startOfDay,
                $lte: endOfDay
            }
        });

        // 3. Return true/false
        res.status(200).json(!!existingRecord);

    } catch (error) {
        next(error);
    }
}

const fetchScheduledRequestsByDayOfWeek = async (dayOfWeek) => {

}

//when admin approved the request, create a function that will scan the status of an meal eligibiltity request (scheduled and note scheduled). if APPROVED, create a function that will "mass eligible" and "mass waive" the students from the eligibility list.

//for basic education, the function has a parameter of the class adviser's ID, which naturally prevents them to submit another list, the class adviser's ID will act as the eligiblity ID of the list they submitted.

/* for higher education, the function has a parameter of the admin-assistant's ID, followed by program and year that is hyperated.
e.g. 22-000111aaa-BSIS-2
that will server as the eligibility ID of the list they submitted.

*/


export {
    submitDailyMealRequestList,
    submitScheduledMealRequestList,
    fetchDailyRequestsBySection
}