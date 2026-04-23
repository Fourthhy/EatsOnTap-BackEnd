import Student from "../../models/student.js";
import SectionProgram from "../../models/sectionprogram.js";
import ArchivedStudent from "../../models/archivedStudents.js";

/**
 * @desc    Create a new Student and link to Section/Program
 * @route   POST /api/students
 */
const createStudent = async (req, res) => {
    try {
        const { section, program, year, ...restOfStudentData } = req.body;

        // 1. Validate that the student has either a section or a program (not neither, not both)
        if (!section && !program) {
            return res.status(400).json({ success: false, message: "A student must be assigned to either a section or a program." });
        }
        if (section && program) {
            return res.status(400).json({ success: false, message: "A student cannot belong to both a section and a program." });
        }
        if (!year) {
            return res.status(400).json({ success: false, message: "Year is required." });
        }

        // 2. Look for the matching SectionProgram
        const matchQuery = { year };
        if (section) matchQuery.section = section;
        if (program) matchQuery.program = program;

        const matchedSectionProgram = await SectionProgram.findOne(matchQuery);

        if (!matchedSectionProgram) {
            return res.status(404).json({
                success: false,
                message: `Cannot create student. No matching record found for Year: ${year} and ${section ? 'Section: ' + section : 'Program: ' + program}.`
            });
        }

        // 3. Attempt to create and save the student
        const newStudent = new Student({
            section,
            program,
            year,
            ...restOfStudentData
        });

        const savedStudent = await newStudent.save();

        // 4. If student successfully saves, increment the studentCount in SectionProgram
        // We use $inc to do this atomically directly in the database
        await SectionProgram.findByIdAndUpdate(
            matchedSectionProgram._id,
            { $inc: { studentCount: 1 } }
        );

        return res.status(201).json({
            success: true,
            data: savedStudent
        });

    } catch (error) {
        // Handle unique constraint violation for studentID
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "A student with this studentID already exists. Creation aborted."
            });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
};
/**
 * @desc    Get all Students
 * @route   GET /api/students
 */
const getAllStudents = async (req, res) => {
    try {
        const students = await Student.find({});

        return res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Get a single Student by ID
 * @route   GET /api/students/:id
 */
const getStudentById = async (req, res) => {
    try {
        const { id } = req.params;
        const student = await Student.findById(id);

        if (!student) {
            return res.status(404).json({ success: false, message: "Student not found." });
        }

        return res.status(200).json({
            success: true,
            data: student
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Update a Student
 * @route   PUT /api/students/:id
 */
const updateStudent = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const updatedStudent = await Student.findByIdAndUpdate(
            id,
            updates,
            { new: true, runValidators: true }
        );

        if (!updatedStudent) {
            return res.status(404).json({ success: false, message: "Student not found." });
        }

        return res.status(200).json({
            success: true,
            data: updatedStudent
        });

    } catch (error) {
        // Handle unique constraint violation in case they try to update to an existing studentID
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "A student with this studentID already exists."
            });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Delete a Student
 * @route   DELETE /api/students/:id
 */
const deleteStudent = async (req, res) => {
    try {
        const { id } = req.params;

        const deletedStudent = await Student.findByIdAndDelete(id);

        if (!deletedStudent) {
            return res.status(404).json({ success: false, message: "Student not found." });
        }

        return res.status(200).json({
            success: true,
            message: "Student successfully deleted."
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const archiveStudent = async (req, res) => {
    try {
        const { id } = req.body;

        // 1. Fetch the target student using findById
        const targetStudent = await Student.findById(id);

        // 2. Validate the student exists
        if (!targetStudent) {
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        // 3. Create a new document in the ArchivedStudent collection
        // Mongoose will automatically map the matching fields and ignore 
        // fields that don't exist in the archive schema (like temporaryClaimStatus).
        const archivedData = new ArchivedStudent({
            rfidTag: targetStudent.rfidTag,
            studentID: targetStudent.studentID,
            first_name: targetStudent.first_name,
            middle_name: targetStudent.middle_name,
            last_name: targetStudent.last_name,
            section: targetStudent.section,
            program: targetStudent.program,
            year: targetStudent.year,
            academicStatus: targetStudent.academicStatus,
            claimRecords: targetStudent.claimRecords
        });

        // 4. Save to the archive database
        await archivedData.save();

        // 5. Delete the original record from the active Student database
        await Student.findByIdAndDelete(id);

        // 6. Return a success response
        return res.status(200).json({
            success: true,
            message: "Student successfully archived.",
            data: archivedData
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
}


export {
    createStudent,
    getAllStudents,
    getStudentById,
    updateStudent,

    //If the student is archived, delete it upon export
    deleteStudent,
    archiveStudent
};
