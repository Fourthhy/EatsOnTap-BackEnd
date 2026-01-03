import Student from "../models/student.js"
import Users from '../models/user.js';
import eligibilityBasicEd from '../models/eligibilityBasicEd.js';
import eligibilityHigherEd from '../models/eligibilityHigherEd.js';
import event from "../models/event.js";

import Setting from '../models/setting.js';

import claimPerMealCount from '../models/admin/claimPerMealCount.js';
import claimTrends from '../models/admin/claimTrends.js';
import eligibilityCount from '../models/admin/eligibilityCount.js';
import programStatusCount from '../models/admin/programStatusCount.js';

import mealValue from "../models/mealValue.js";

import claimRecord from "../models/claimRecord.js";

//Approving Meal Eligibility Request and Scheduled Meal Eligibiltiy Request

//Transforming Status from "PENDING" to "APPROVED"

//dito rin papasok yung 3rd setting, titignan nia kung naka enable ba na merong time mag bigay ng credit si PSAS

const getStudentIDsBySection = async (section) => {
    if (!section) {
        throw new Error("Section parameter is required to fetch student IDs");
    }

    const allStudentIDsInSection = await Student.find(
        { section: section },
        { studentID: 1, _id: 0 })

    const allStudentIDs = allStudentIDsInSection.map(student => student.studentID);
    return allStudentIDs;
}

const approveMealEligibilityRequest = async (req, res, next) => {
    try {
        const { eligibilityID } = req.params;

        // 1. Fetch and Validate the Eligibility Request
        const eligibilityRequest = await eligibilityBasicEd.findOne({ eligibilityID });

        if (!eligibilityRequest) {
            return res.status(404).json({ message: "Meal eligibility list does not exist" });
        }

        if (eligibilityRequest.status === 'APPROVED') {
            return res.status(400).json({ message: "This list is already approved" });
        }

        // 2. Fetch Student Details for the "Eligible" list
        // We need this to get their current creditValue for the record
        const eligibleStudentsData = await Student.find({
            studentID: { $in: eligibilityRequest.forEligible }
        });

        // 3. Prepare the Data Structure for ClaimRecord
        const newSectionRecord = {
            section: eligibilityRequest.section,

            // Map the eligible students to the required schema structure
            eligibleStudents: eligibleStudentsData.map(student => ({
                studentID: student.studentID,
                claimType: 'ELIGIBLE', // Default type
                creditBalance: student.creditValue || 0, // Copy current value from Student model
                onHandCash: 0 // Default start value
            })),

            // Map the waived students (Assuming just IDs for now)
            waivedStudents: eligibilityRequest.forTemporarilyWaived.map(id => ({
                studentID: id
            }))
        };

        // 4. Determine Date Range for "Today"
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        // 5. Find if a ClaimRecord already exists for today
        let dailyRecord = await claimRecord.findOne({
            claimDate: { $gte: startOfDay, $lte: endOfDay }
        });

        if (dailyRecord) {
            // SCENARIO A: Record exists, append the new section
            // Check if section already exists to prevent duplicates (Optional but safe)
            const sectionExists = dailyRecord.claimRecords.some(r => r.section === eligibilityRequest.section);

            if (sectionExists) {
                return res.status(400).json({ message: "This section has already been approved for today." });
            }

            dailyRecord.claimRecords.push(newSectionRecord);
            await dailyRecord.save();

        } else {
            // SCENARIO B: No record for today, create a new one
            dailyRecord = new claimRecord({
                claimDate: new Date(), // Set explicit now
                claimRecords: [newSectionRecord]
            });
            await dailyRecord.save();
        }

        // 6. Finalize: Update the status of the request to APPROVED
        eligibilityRequest.status = 'APPROVED';
        await eligibilityRequest.save();

        res.status(200).json({
            message: `Meal eligibility list ${eligibilityID} APPROVED and synced to Daily Records.`
        });

    } catch (error) {
        next(error);
    }
}

const approveScheduleMealEligibilityRequest = async (req, res) => {
    try {
        const eligibilityRequestList = await eligibilityHigherEd.findOne({ eligibilityID: req.params.eligibilityID });
        if (!eligibilityRequestList) {
            return res.status(404).json({ message: "meal eligibility list does not exist" });
        }
        eligibilityRequestList.status = 'APPROVED';
        await eligibilityRequestList.save()
        res.status(200).json({ message: `meal eligibility list ${eligibilityRequestList.eligibilityID} is now APPROVED` })
    } catch (error) {
        throw new Error(error.message);
    }
}

const approveEvents = async (req, res) => {
    try {
        const schoolEvent = await event.findOne({ eventID: req.params.eventID });
        if (!schoolEvent) {
            res.status(404).json({ message: "No such event exist!" });
        }
        schoolEvent.status = 'APPROVED';
        await schoolEvent.save()
        res.status(200).json({ message: `${schoolEvent.eventName} event is now approved!` });
    } catch (error) {
        throw new Error(error)
    }
}

const fetchClaimPerMealCount = async (req, res, next) => {
    try {
        // Get values from request (adjust source as needed: query, params, or body)
        const { entryDay, entryMonth, entryYear } = req.query;

        // Build a query object—Parse to Number if these come in as strings!
        const query = {};
        if (entryDay != null) query.entryDay = Number(entryDay);
        if (entryMonth != null) query.entryMonth = Number(entryMonth);
        if (entryYear != null) query.entryYear = Number(entryYear);

        // Perform the search
        const claimCount = await claimPerMealCount.findOne(query);

        if (!claimCount) {
            return res.status(404).json({ message: "No record found!" });
        }

        res.status(200).json(claimCount);
    } catch (error) {
        next(error);
    }
};

const generateEligibilityList = async (req, res, next) => {
    const { section, forEligibleStudentIds } = req.body;

    console.log("Received Request for Section:", section); // Debug log

    try {
        // 1. Check Settings
        const submitSetting = await Setting.findOne({ setting: 'SUBMIT-MEAL-REQUEST' });
        if (!submitSetting) return res.status(400).json({ message: "Setting not found" });
        if (!submitSetting.settingEnable) return res.status(400).json({ message: "Setting is disabled" });
        if (!submitSetting.settingActive) return res.status(400).json({ message: "Setting is not active" });

        // 2. Validate Input
        if (!Array.isArray(forEligibleStudentIds)) {
            return res.status(400).json({ message: "Missing required field: forEligibleStudentIds" });
        }

        // 3. Find All Students in this Section (Direct DB Query)
        // 🟢 FIX: Replaces 'getStudentIDsBySection' and fixes 'student' variable case
        const allStudentsInSection = await Student.find({ section: section });

        // 🟢 FIX: Correct typo 'lenght' -> 'length'
        if (allStudentsInSection.length === 0) {
            return res.status(404).json({ message: `No students found in section: ${section}` });
        }

        // 4. Calculate Logic
        const waivedByDefault = new Set(
            allStudentsInSection
                .filter(s => s.mealEligibilityStatus === 'WAIVED')
                .map(s => s.studentID || s.studentID) // Handle potential field name diffs
        );

        const eligibleSet = new Set(forEligibleStudentIds);

        // Get all IDs from the DB result
        const allStudentIds = allStudentsInSection.map(s => s.studentID || s.studentID);

        const forTemporarilyWaived = allStudentIds.filter(id =>
            !eligibleSet.has(id) && !waivedByDefault.has(id)
        );

        const forEligible = forEligibleStudentIds.filter(id => !waivedByDefault.has(id));

        // 5. Create Record
        const newEligibilityListing = new eligibilityBasicEd({
            eligibilityID: `${section}-ADMIN-GENERATED`,
            requester: "ADMIN",
            section: section,
            forEligible: forEligible,
            forTemporarilyWaived: forTemporarilyWaived,
            status: "APPROVED" // Admin generated is always approved
        });

        await newEligibilityListing.save();

        // 6. Socket Emit
        const io = req.app.get('socketio');
        if (io) {
            io.emit('meal-request-submit', { type: 'Basic Education' });
        }

        res.status(201).json({
            message: `Eligibility list submitted for ${section}`,
            totalStudents: allStudentIds.length,
            eligibleCount: forEligible.length,
            waivedCount: forTemporarilyWaived.length,
            data: newEligibilityListing
        });

    } catch (error) {
        console.error("Server Error in generateEligibilityList:", error); // 🟢 LOG THE ERROR
        res.status(500).json({ message: error.message || "Internal Server Error" });
    }
};

const addMealValue = async (req, res, next) => {
    try {
        const { desiredMealValue } = req.body;

        // 1. Try to find the existing setting
        let creditValue = await mealValue.findOne();

        // 2. If it doesn't exist yet, create a NEW one
        if (!creditValue) {
            creditValue = new mealValue({ mealValue: desiredMealValue });
        } else {
            // 3. If it exists, update it
            creditValue.mealValue = desiredMealValue;
        }

        // 4. Save the single document
        await creditValue.save();

        res.status(200).json({ message: `Meal value set to ${desiredMealValue} successfully` });
    } catch (error) {
        next(error);
    }
}

const editMealValue = async (req, res, next) => {
    try {
        const { desiredMealValue } = req.body;

        // Use findOne() to get the actual object, not an array
        const creditValue = await mealValue.findOne();

        if (!creditValue) {
            return res.status(404).json({ message: "No meal value set yet. Please add one first." });
        }

        creditValue.mealValue = desiredMealValue;
        await creditValue.save();

        res.status(200).json({ message: `Updated to ${desiredMealValue} successfully` });
    } catch (error) {
        next(error);
    }
}

const checkMealCreditValue = async (req, res, next) => {
    try {
        const creditValue = await mealValue.find();
        if (!creditValue) {
            res.status(404).json({ message: "No credit value found" })
        }
        res.status(200).json(creditValue);
    } catch (error) {
        next(error)
    }
}


export {
    approveMealEligibilityRequest,
    approveScheduleMealEligibilityRequest,
    approveEvents,
    fetchClaimPerMealCount,
    generateEligibilityList,
    addMealValue,
    editMealValue,
    checkMealCreditValue
}