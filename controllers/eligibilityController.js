//This controller approves meal recepient list

import classAdviser from '../models/classAdviser.js';
import eligibilityBasicEd from '../models/eligibilityBasicEd.js'
import student from '../models/student.js'
// import { eligibleStudent } from './studentController';

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

const submitMealRequestList = async (req, res, next) => {
    try {
        const { requesterID, section, eligibleStudentIDs } = req.body;

        //check and validate fields
        if (!requesterID || !section || !Array.isArray(eligibleStudentIDs)) {
            return res.status(400).json({ message: "Missing required fields" })
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
        const allStudents = await student.find({ studentID: { $in: allStudentIDs }});

        const waivedByDefault = new Set(
            allStudents
                .filter( student => student.mealEligibilityStatus === 'WAIVED')
                .map( student => student.studentID )
        )

        //Determine temporarily waived students (those are exempted from the given list)
        const eligibleSet = new Set(eligibleStudentIDs);

        const forTemporarilyWaived = allStudentIDs.filter(studentID => 
            !eligibleSet.has(studentID) && !waivedByDefault.has(studentID)
        )

        const forEligible = eligibleStudentIDs.filter(studentID => !waivedByDefault.has(studentID));

        const newEligibilityListing = new eligibilityBasicEd({
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

export {
    submitMealRequestList,
}