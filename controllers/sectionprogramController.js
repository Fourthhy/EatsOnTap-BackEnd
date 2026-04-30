import SectionProgram from "../models/sectionprogram.js";
import Student from "../models/student.js";
import classAdviser from "../models/classAdviser.js";

const addSectionProgram = async (req, res, next) => {
    try {
        const { department, year, section, program, handleAdviser } = req.body;

        if (!department || !year) {
            return res.status(400).json({ message: "Department and Year are required fields." });
        }

        if (!section && !program) {
            return res.status(400).json({ message: "Please provide either a Section name or a Program name." });
        }

        // 🟢 1. MAP FRONTEND STRINGS TO SCHEMA ENUMS
        const deptEnumMap = {
            'Preschool': 'PRESCHOOL',
            'Primary Education': 'PRIMARY',
            'Intermediate': 'INTERMEDIATE',
            'Junior High School': 'JUNIOR HIGH SCHOOL',
            'Senior High School': 'SENIOR HIGH SCHOOL',
            'Higher Education': 'HIGHER EDUCATION'
        };

        // Get the mapped value, fallback to uppercasing it just in case
        const mappedDepartment = deptEnumMap[department.trim()] || department.trim().toUpperCase();

        // 2. Check for Duplicates
        const query = {
            department: mappedDepartment,
            year: year.trim()
        };

        if (section) query.section = section.trim();
        if (program) query.program = program.trim();

        const existingEntry = await SectionProgram.findOne(query);

        if (existingEntry) {
            return res.status(409).json({ message: "This exact Section or Program entry already exists." });
        }

        // 🟢 3. SAVE RECORD (Fixing the adviser field mapping)
        const newEntry = new SectionProgram({
            department: mappedDepartment,
            year: year.trim(),
            section: section ? section.trim() : undefined,
            program: program ? program.trim() : undefined,
            
            // Map the frontend's 'handleAdviser' strictly to the schema's 'adviser'
            adviser: handleAdviser ? handleAdviser.trim() : undefined, 
            
            studentCount: 0
        });

        await newEntry.save();

        res.status(201).json({
            message: "Entry added successfully",
            data: newEntry
        });

        // Socket.io Broadcast
        const io = req.app.get('socketio');
        if (io) {
            io.emit('update-section-program-register', { type: 'All-section-programs', message: 'Update section-program register' });
        }

    } catch (error) {
        // Helpful error logging to catch any remaining schema validation issues
        if (error.name === 'ValidationError') {
            console.error("Schema Validation Error:", error.errors);
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        next(error);
    }
};

const fetchAllSectionProgram = async (req, res, next) => {
    try {
        // Fetch all documents from the collection
        // .lean() is optional but recommended for faster read-only operations
        const allSections = await SectionProgram.find({}).lean().sort({ department: 1, year: 1, section: 1, program: 1 }); // Optional: Sorts A-Z

        if (!allSections || allSections.length === 0) {
            return res.status(200).json({ message: "No section programs found." });
        }

        res.status(200).json({
            message: "Successfully fetched all section programs",
            count: allSections.length,
            data: allSections
        });

    } catch (error) {
        next(error);
    }
};

const generateSectionPrograms = async (req, res, next) => {
    try {
        console.log("🔄 Starting Section/Program Synchronization...");

        // 1. AGGREGATE: Group students by unique Year + Section + Program
        const uniqueGroups = await Student.aggregate([
            {
                $group: {
                    _id: {
                        section: "$section",
                        program: "$program",
                        year: "$year"
                    },
                    studentCount: { $sum: 1 } // Count students in this group
                }
            }
        ]);

        if (uniqueGroups.length === 0) {
            return res.status(200).json({ message: "No students found to generate sections from." });
        }

        // 2. FETCH ADVISERS: Get all advisers who have a section assigned
        // We fetch them all at once to avoid querying inside a loop (N+1 problem)
        const allAdvisers = await classAdviser.find({
            section: { $exists: true, $ne: null }
        });

        // Create a Lookup Map for faster access: Key = Section Name, Value = Formatted Name
        const adviserMap = {};
        allAdvisers.forEach(adviser => {
            // Format: "Mr. John Doe"
            const fullName = `${adviser.first_name} ${adviser.last_name}`;
            adviserMap[adviser.section] = fullName;
        });

        // 3. PREPARE BULK OPERATIONS
        const bulkOps = uniqueGroups.map(group => {
            const { section, program, year } = group._id;
            const count = group.studentCount;

            // Determine Department
            let department = "Unknown Department";
            if (program) department = "Higher Education";
            else if (section) department = "Basic Education";

            // Determine Adviser (Only applicable if 'section' exists)
            // If we find an adviser for this section, use their name. Otherwise, keep existing or set "Unassigned".
            const matchedAdviser = section && adviserMap[section] ? adviserMap[section] : "Unassigned";

            // Define Filter
            const filter = {
                year: year,
                section: section || null,
                program: program || null
            };

            // Define Update Payload
            const updateFields = {
                department: department,
                year: year,
                section: section || undefined,
                program: program || undefined,
                studentCount: count,
            };

            // Only update the adviser field if we actually found a match.
            // This prevents overwriting a manually set adviser with "Unassigned" if the adviser account is temporarily missing.
            if (matchedAdviser !== "Unassigned") {
                updateFields.handleAdviser = matchedAdviser;
            }

            return {
                updateOne: {
                    filter: filter,
                    update: { $set: updateFields },
                    upsert: true
                }
            };
        });

        // 4. EXECUTE WRITES
        const result = await SectionProgram.bulkWrite(bulkOps);

        console.log("✅ Sync Complete:", result);

        res.status(200).json({
            message: "Section Programs and Advisers synchronized successfully.",
            details: {
                groupsProcessed: uniqueGroups.length,
                matched: result.matchedCount,
                upserted: result.upsertedCount,
                modified: result.modifiedCount
            }
        });

    } catch (error) {
        console.error("Error generating section programs:", error);
        next(error);
    }
};

export {
    addSectionProgram,
    fetchAllSectionProgram,
    generateSectionPrograms
}