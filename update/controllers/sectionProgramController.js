import SectionProgram from "../../models/sectionprogram.js"

/**
 * @desc    Create a new Section or Program
 * @route   POST /api/section-programs
 */
const createSectionProgram = async (req, res) => {
    try {
        const { department, year, section, program, adviser, studentCount } = req.body;

        // Condition: Create will not work if there is no entry from section OR program
        if (!section && !program) {
            return res.status(400).json({ 
                success: false, 
                message: "Validation Error: You must provide either a 'section' or a 'program'." 
            });
        }

        // Optional best practice: Prevent providing BOTH section and program if they should be mutually exclusive
        if (section && program) {
            return res.status(400).json({
                success: false,
                message: "Validation Error: A record cannot be both a 'section' and a 'program' simultaneously."
            });
        }

        if(section && !adviser) {
            return res.status(400).json({
                success: false,
                message: "Validation Error: A 'section' record must have an 'adviser' assigned."
            })
        }

        const newRecord = new SectionProgram({
            department,
            year,
            section,
            program,
            adviser,
            studentCount
        });

        const savedRecord = await newRecord.save();
        
        return res.status(201).json({ 
            success: true, 
            data: savedRecord 
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Get all Sections and Programs
 * @route   GET /api/section-programs
 */
const getAllSectionPrograms = async (req, res) => {
    try {
        // Condition: Read must fetch all of the records in the collection
        const records = await SectionProgram.find({});
        
        return res.status(200).json({ 
            success: true, 
            count: records.length,
            data: records 
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Update a Section or Program
 * @route   PUT /api/section-programs/:id
 */
const updateSectionProgram = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };

        const existingRecord = await SectionProgram.findById(id);
        if (!existingRecord) {
            return res.status(404).json({ success: false, message: "Record not found." });
        }

        // Catch 1: Prevent swapping Section and Program or removing their names
        if (existingRecord.section) {
            if (updates.program) return res.status(400).json({ success: false, message: "Cannot change a section into a program." });
            if (updates.section === "" || updates.section === null) return res.status(400).json({ success: false, message: "Section name cannot be removed." });
        } else if (existingRecord.program) {
            if (updates.section) return res.status(400).json({ success: false, message: "Cannot change a program into a section." });
            if (updates.program === "" || updates.program === null) return res.status(400).json({ success: false, message: "Program name cannot be removed." });
        }

        // Catch 2 & 3: Adviser cannot be removed, only replaced
        // If an adviser already exists, and the incoming update tries to set it to a falsy value (empty string/null)
        if (existingRecord.adviser && 'adviser' in updates && !updates.adviser) {
            return res.status(400).json({ success: false, message: "Class adviser cannot be removed, only replaced." });
        }

        // Note: Programs can naturally be duplicated with different years since we don't have a 'unique' index on them in the schema.

        // Apply all accepted updates
        const updatedRecord = await SectionProgram.findByIdAndUpdate(
            id,
            updates, // Applies all parameters passed in req.body
            { new: true, runValidators: true }
        );

        return res.status(200).json({ 
            success: true, 
            data: updatedRecord 
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Delete a Section or Program entirely
 * @route   DELETE /api/section-programs/:id
 */
const deleteSectionProgram = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Fetch the record to inspect its properties before deleting
        const existingRecord = await SectionProgram.findById(id);

        if (!existingRecord) {
            return res.status(404).json({ success: false, message: "Record not found." });
        }

        // 2. Validation: Ensure student count is exactly 0
        if (existingRecord.studentCount > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot delete this record. There are still ${existingRecord.studentCount} student(s) assigned to this section/program.` 
            });
        }

        // 3. Delete the record entirely
        await SectionProgram.findByIdAndDelete(id);

        return res.status(200).json({ 
            success: true, 
            message: "Record successfully deleted." 
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export {
    createSectionProgram,
    getAllSectionPrograms,
    updateSectionProgram,
    deleteSectionProgram
};