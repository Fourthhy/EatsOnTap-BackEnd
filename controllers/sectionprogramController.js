import SectionProgram from "../models/sectionprogram.js";

const addSectionProgram = async (req, res, next) => {
    try {
        // 1. Destructure the new field
        const { department, year, section, program, handleAdviser } = req.body;

        // 2. Validate Mandatory Fields
        if (!department || !year) {
            return res.status(400).json({
                message: "Department and Year are required fields."
            });
        }

        // 3. Validate Context (Must have Section OR Program)
        if (!section && !program) {
            return res.status(400).json({
                message: "Please provide either a Section name or a Program name."
            });
        }

        // 4. Check for Duplicates
        // We verify uniqueness based on Dept + Year + Section/Program
        // (We ignore adviser here so you don't create duplicate sections)
        const query = {
            department: department.trim(),
            year: year.trim()
        };

        if (section) query.section = section.trim();
        if (program) query.program = program.trim();

        const existingEntry = await SectionProgram.findOne(query);

        if (existingEntry) {
            return res.status(409).json({
                message: "This exact Section or Program entry already exists."
            });
        }

        // 5. Create New Record with Adviser
        const newEntry = new SectionProgram({
            department: department.trim(),
            year: year.trim(),
            section: section ? section.trim() : undefined,
            program: program ? program.trim() : undefined,
            handleAdviser: handleAdviser ? handleAdviser.trim() : undefined
        });

        await newEntry.save();

        res.status(201).json({
            message: "Entry added successfully",
            data: newEntry
        });

    } catch (error) {
        next(error);
    }
};

export {
    addSectionProgram
}