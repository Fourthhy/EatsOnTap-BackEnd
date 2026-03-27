import Student from "../models/student.js"
import Users from '../models/user.js';
import eligibilityBasicEd from '../models/eligibilityBasicEd.js';
import eligibilityHigherEd from '../models/eligibilityHigherEd.js';
import Event from "../models/event.js";

import Setting from '../models/setting.js';

import claimPerMealCount from '../models/admin/claimPerMealCount.js';
import ClaimRecord from '../models/claimRecord.js';
import claimTrends from '../models/admin/claimTrends.js';
import eligibilityCount from '../models/admin/eligibilityCount.js';
import programStatusCount from '../models/admin/programStatusCount.js';

import mealValue from "../models/mealValue.js";

import claimRecord from "../models/claimRecord.js";

import { logAction } from "./systemLoggerController.js"
import { addNotification } from "./notificationController.js"

import Report from "../models/report.js";

import MonthlyReport from "../models/monthlyReport.js";

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

const getTodayDateComponents = () => {
    const now = new Date();
    return {
        day: now.getDate(),
        month: now.getMonth() + 1, // JS months are 0-11
        year: now.getFullYear()
    };
};

const approveMealEligibilityRequest = async (req, res, next) => {
    try {
        const { eligibilityID } = req.params;

        // 1. Fetch Eligibility Request
        const eligibilityRequest = await eligibilityBasicEd.findOne({
            eligibilityID: eligibilityID
        }).sort({ timeStamp: -1 });

        if (!eligibilityRequest) {
            return res.status(404).json({ message: "Request not found." });
        }

        if (eligibilityRequest.status === 'APPROVED') {
            return res.status(400).json({ message: "This list is already approved." });
        }

        // 2. Prepare Data
        const mealSetting = await mealValue.findOne();
        const currentMealValue = mealSetting ? mealSetting.mealValue : 0;

        const eligibleStudentsData = await Student.find({
            studentID: { $in: eligibilityRequest.forEligible }
        });

        // 3. Handle Daily Claim Record (The "Live" List)
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        let dailyRecord = await ClaimRecord.findOne({
            claimDate: { $gte: startOfDay, $lte: endOfDay }
        });

        const newStudentsPayload = eligibleStudentsData.map(student => ({
            studentID: student.studentID,
            claimType: 'ELIGIBLE',
            creditBalance: currentMealValue,
            onHandCash: 0
        }));

        if (dailyRecord) {
            const sectionIndex = dailyRecord.claimRecords.findIndex(r => r.section === eligibilityRequest.section);

            if (sectionIndex !== -1) {
                // === SECTION EXISTS: MERGE MODE ===
                const existingIDs = new Set(dailyRecord.claimRecords[sectionIndex].eligibleStudents.map(s => s.studentID));
                const studentsToAdd = newStudentsPayload.filter(s => !existingIDs.has(s.studentID));

                if (studentsToAdd.length > 0) {
                    dailyRecord.claimRecords[sectionIndex].eligibleStudents.push(...studentsToAdd);
                    await dailyRecord.save();
                }
            } else {
                // === NEW SECTION: ADD MODE ===
                dailyRecord.claimRecords.push({
                    section: eligibilityRequest.section,
                    eligibleStudents: newStudentsPayload,
                    waivedStudents: (eligibilityRequest.forTemporarilyWaived || []).map(id => ({ studentID: id }))
                });
                await dailyRecord.save();
            }

        } else {
            // === NEW DAY: CREATE MODE ===
            dailyRecord = new ClaimRecord({
                claimDate: startOfDay,
                claimRecords: [{
                    section: eligibilityRequest.section,
                    eligibleStudents: newStudentsPayload,
                    waivedStudents: (eligibilityRequest.forTemporarilyWaived || []).map(id => ({ studentID: id }))
                }]
            });
            await dailyRecord.save();
        }

        // 4. Finalize Request Status
        eligibilityRequest.status = 'APPROVED';
        await eligibilityRequest.save();

        // =========================================================
        // 🟢 5. UPDATE DASHBOARD ANALYTICS (MonthlyReport Model)
        // =========================================================

        // Calculate the exact numbers to add to the dashboard
        const incEligible = eligibilityRequest.forEligible?.length || 0;
        const incWaived = eligibilityRequest.forTemporarilyWaived?.length || 0;
        const incAbsences = eligibilityRequest.forAbsentStudents?.length || 0;
        const incCredits = incEligible * currentMealValue;

        // Get strict Manila boundaries for the query
        const now = new Date();
        const manilaTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Manila" });
        const manilaDate = new Date(manilaTimeStr);

        const bucketMonth = `${manilaDate.getFullYear()}-${String(manilaDate.getMonth() + 1).padStart(2, '0')}`;
        const startOfManilaDay = new Date(manilaDate);
        startOfManilaDay.setHours(0, 0, 0, 0);
        const endOfManilaDay = new Date(manilaDate);
        endOfManilaDay.setHours(23, 59, 59, 999);

        const reportUpdate = await MonthlyReport.findOneAndUpdate(
            { bucketMonth },
            {
                $inc: {
                    // Update Monthly Root Totals
                    "statistics.totalEligible": incEligible,
                    "statistics.totalWaived": incWaived,
                    "statistics.totalAbsences": incAbsences,
                    "financials.totalAllottedCredits": incCredits,
                    "financials.totalUnusedCredits": incCredits, // Added to unused pool until claimed

                    // Update Today's Specific Array Element
                    "dailyReports.$[todayRecord].statistics.totalEligible": incEligible,
                    "dailyReports.$[todayRecord].statistics.totalWaived": incWaived,
                    "dailyReports.$[todayRecord].statistics.totalAbsences": incAbsences,
                    "dailyReports.$[todayRecord].financials.totalAllottedCredits": incCredits,
                    "dailyReports.$[todayRecord].financials.totalUnusedCredits": incCredits
                }
            },
            {
                new: true,
                arrayFilters: [
                    { "todayRecord.date": { $gte: startOfManilaDay, $lte: endOfManilaDay } }
                ]
            }
        );

        if (!reportUpdate) {
            console.warn(`⚠️ Analytics bucket for ${bucketMonth} not found. Stats were not updated.`);
        }

        // =========================================================
        // 🟢 6. UPDATE STUDENT RECORDS (Bulk Update)
        // =========================================================
        const updatePromises = [];

        // A. Update Eligible Students
        if (incEligible > 0) {
            updatePromises.push(
                Student.updateMany(
                    { studentID: { $in: eligibilityRequest.forEligible } },
                    {
                        $set: {
                            temporaryClaimStatus: "ELIGIBLE",
                            temporaryCreditBalance: currentMealValue
                        }
                    }
                )
            );
        }

        // B. Update Waived Students
        if (incWaived > 0) {
            updatePromises.push(
                Student.updateMany(
                    { studentID: { $in: eligibilityRequest.forTemporarilyWaived } },
                    {
                        $set: {
                            temporaryClaimStatus: "WAIVED",
                            temporaryCreditBalance: 0
                        }
                    }
                )
            );
        }

        // C. Update Absent Students
        if (incAbsences > 0) {
            updatePromises.push(
                Student.updateMany(
                    { studentID: { $in: eligibilityRequest.forAbsentStudents } },
                    {
                        $set: {
                            temporaryClaimStatus: "ABSENT",
                            temporaryCreditBalance: 0
                        }
                    }
                )
            );
        }

        // Execute all student updates at the exact same time
        await Promise.all(updatePromises);
        console.log("✅ Student statuses updated successfully.");

        // =========================================================
        // 7. Sockets (And optional logging)
        // =========================================================
        const io = req.app.get('socketio');
        if (io) {
            io.emit('meal-request-submit', { type: 'Basic Education', message: 'Update Triggered' });
        }

        return res.status(200).json({ message: "List approved, synced, and student statuses updated successfully." });

    } catch (error) {
        console.error("❌ Approve Error:", error);
        next(error);
    }
};

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

const approveEvents = async (req, res, next) => {
    try {
        const { eventID } = req.params;

        // 1. Find the Event
        const schoolEvent = await Event.findOne({ eventID: eventID });

        if (!schoolEvent) {
            return res.status(404).json({ message: "No such event exists!" });
        }

        // 2. Update Status
        schoolEvent.submissionStatus = 'APPROVED';

        // 3. Calculate Counts for Basic Ed (Sections)
        // We use Promise.all to run all counting queries in parallel for speed
        if (schoolEvent.forEligibleSection && schoolEvent.forEligibleSection.length > 0) {

            schoolEvent.forEligibleSection = await Promise.all(
                schoolEvent.forEligibleSection.map(async (item) => {
                    // Count students matching Section AND Year
                    const count = await Student.countDocuments({
                        section: item.section,
                        year: item.year
                    });

                    return {
                        section: item.section,
                        year: item.year,
                        totalEligibleCount: count, // 🟢 Inserted Count
                        totalClaimedCount: 0     // Reset or keep 0
                    };
                })
            );
        }

        // 4. Calculate Counts for Higher Ed (Programs)
        if (schoolEvent.forEligibleProgramsAndYear && schoolEvent.forEligibleProgramsAndYear.length > 0) {

            schoolEvent.forEligibleProgramsAndYear = await Promise.all(
                schoolEvent.forEligibleProgramsAndYear.map(async (item) => {
                    // Count students matching Program AND Year
                    const count = await Student.countDocuments({
                        program: item.program,
                        year: item.year
                    });

                    return {
                        program: item.program,
                        year: item.year,
                        totalEligibleCount: count, // 🟢 Inserted Count
                        totalClaimedCount: 0
                    };
                })
            );
        }

        // 5. Save Updates
        await schoolEvent.save();

        res.status(200).json({
            message: `${schoolEvent.eventName} event is now approved and counts have been updated!`,
            data: schoolEvent
        });

    } catch (error) {
        // Use next(error) for consistency with Express error handling
        next(error);
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

// =====================================================================
// 🚀 NEW: BULK PROMOTION & GRADUATION CONTROLLER
// =====================================================================
const promoteStudentsBulk = async (req, res, next) => {
    try {
        const {
            department,     // 'basic' or 'higher'
            currentLevel,   // e.g., '11' or '1'
            currentGroup,   // The Section (Basic) or Program (Higher) name
            targetLevel,    // The level they are going to
            targetGroup,    // The NEW Section (Basic Ed only)
            action          // 'promote' or 'graduate'
        } = req.body;

        // 1. Build the Search Filter (Who are we updating?)
        const filter = { year: currentLevel };

        // 🟢 FIX: Only filter by program/section if currentGroup was actually provided
        if (currentGroup) {
            if (department === 'higher') {
                filter.program = currentGroup;
            } else {
                filter.section = currentGroup;
            }
        }

        // 2. Double Check: Are there even students to update?
        const studentCount = await Student.countDocuments(filter);
        if (studentCount === 0) {
            return res.status(404).json({
                success: false,
                message: `No students found in ${currentLevel} - ${currentGroup}.`
            });
        }

        // 3. Build the Update Document (What are we changing?)
        let updateDoc = {};

        if (action === 'graduate') {
            // 🎓 Graduation Logic: Keep their records, but mark them as Alumni
            updateDoc = {
                $set: {
                    type: 'Alumni', // Or 'Graduated', depending on your schema
                    // Optional: You could clear their RFID tags here so they can be reused next year!
                    // rfidTag: "" 
                }
            };
        } else if (action === 'promote') {
            // 📈 Promotion Logic
            if (department === 'higher') {
                // Higher Ed: Just increment the year, program stays the same
                updateDoc = { $set: { year: targetLevel } };
            } else {
                // Basic Ed: Increment year AND assign to the new section
                if (!targetGroup) {
                    return res.status(400).json({ message: "Target section is required for Basic Ed promotion." });
                }
                updateDoc = {
                    $set: {
                        year: targetLevel,
                        section: targetGroup
                    }
                };
            }
        } else {
            return res.status(400).json({ message: "Invalid action specified." });
        }

        // 4. EXECUTE THE BULK UPDATE (The MERN Expert Way)
        const result = await Student.updateMany(filter, updateDoc);

        // 5. Log the massive action for security audits
        const actorID = req.user ? (req.user._id || req.user.userID) : 'SYSTEM';
        const actorName = req.user ? req.user.email : 'Admin';

        await logAction(
            { id: actorID, type: 'User', name: actorName, role: 'ADMIN' },
            action === 'graduate' ? 'GRADUATE_SECTION' : 'PROMOTE_SECTION',
            'SUCCESS',
            {
                description: `Bulk updated ${result.modifiedCount} students from ${currentLevel}-${currentGroup}.`,
            }
        );

        return res.status(200).json({
            success: true,
            message: `Successfully ${action === 'graduate' ? 'graduated' : 'promoted'} ${result.modifiedCount} students!`,
            modifiedCount: result.modifiedCount
        });

    } catch (error) {
        console.error("Bulk Promotion Error:", error);
        next(error);
    }
};


export {
    approveMealEligibilityRequest,
    approveScheduleMealEligibilityRequest,
    approveEvents,
    fetchClaimPerMealCount,
    generateEligibilityList,
    addMealValue,
    editMealValue,
    checkMealCreditValue,
    promoteStudentsBulk
}