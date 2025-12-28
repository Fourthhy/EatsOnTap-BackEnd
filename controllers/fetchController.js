import Student from "../models/student.js";
import classAdviser from "../models/classAdviser.js";

const getAllClassAdvisers = async (req, res, next) => {
    try {
        const allClassAdvisers = await classAdviser.find();
        res.status(200).json(allClassAdvisers);
    } catch (error) {
        next(error);
    }
}

function getOrdinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
}

const getProgramsAndSections = async (req, res, next) => {
    try {
        // STEP 1: Aggregation - The "Student First" Approach
        const rawData = await Student.aggregate([
            // 1. Group students by 'section' to distinct them
            //    This creates one entry per section and counts the students immediately.
            {
                $group: {
                    _id: "$section", // Group by unique section name
                    studentCount: { $sum: 1 }, // Count students in this group
                    year: { $first: "$year" }, // Grab the year level
                    program: { $first: "$program" } // Grab program (crucial for Higher Ed)
                }
            },
            // 2. "Map" the Adviser to this section using $lookup
            {
                $lookup: {
                    from: "classadvisers", // ⚠️ CHECK DB: usually lowercase plural 'classadvisers'
                    localField: "_id",     // The section name from Student
                    foreignField: "section", // The section name in Adviser
                    as: "adviserInfo"
                }
            },
            // 3. Format the result for our JS processing
            {
                $project: {
                    _id: 0,
                    section: "$_id",
                    studentCount: 1,
                    year: 1,
                    program: 1,
                    // Extract adviser name safely (if no adviser, return "Unassigned")
                    adviserName: {
                        $let: {
                            vars: { firstAdv: { $arrayElemAt: ["$adviserInfo", 0] } },
                            in: {
                                $cond: {
                                    if: { $not: ["$$firstAdv"] },
                                    then: "Unassigned",
                                    else: {
                                        $concat: [
                                            // 1. Use $ifNull to provide a fallback if the field is missing
                                            { $ifNull: ["$$firstAdv.honorific", ""] },
                                            { $cond: [{ $ifNull: ["$$firstAdv.honorific", false] }, " ", ""] }, // Only add space if honorific exists

                                            { $ifNull: ["$$firstAdv.first_name", ""] },
                                            " ",
                                            { $ifNull: ["$$firstAdv.last_name", ""] }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                }
            }
        ]);

        // STEP 2: JavaScript Processing - Categorize and Sort
        // We define buckets for each category
        const categories = {
            preschool: {},
            primaryEducation: {},
            intermediate: {},
            juniorHighSchool: {},
            seniorHighSchool: {},
            higherEducation: {}
        };

        // Helper: Logic to determine where a record belongs
        rawData.forEach(record => {
            const yearStr = String(record.year).toLowerCase();
            let catKey = null;
            let gradeLabel = null;
            let sortOrder = 99;

            // --- LOGIC MAP ---

            // 1. Preschool ("pre" or "0")
            if (yearStr === "pre") {
                catKey = "preschool"; gradeLabel = "Nursery"; sortOrder = 0;
            } else if (yearStr === "0") {
                catKey = "preschool"; gradeLabel = "Kindergarten"; sortOrder = 1;
            }

            // 2. Basic Ed (1-12)
            else if (!isNaN(parseInt(yearStr)) && !record.program) {
                const lvl = parseInt(yearStr);
                if (lvl >= 1 && lvl <= 3) { catKey = "primaryEducation"; gradeLabel = `Grade ${lvl}`; sortOrder = lvl; }
                else if (lvl >= 4 && lvl <= 6) { catKey = "intermediate"; gradeLabel = `Grade ${lvl}`; sortOrder = lvl; }
                else if (lvl >= 7 && lvl <= 10) { catKey = "juniorHighSchool"; gradeLabel = `Grade ${lvl}`; sortOrder = lvl; }
                else if (lvl >= 11 && lvl <= 12) { catKey = "seniorHighSchool"; gradeLabel = `Grade ${lvl}`; sortOrder = lvl; }
            }

            // 3. Higher Education (If 'program' exists or year format differs)
            // Adjust this logic if your College students store "1" in year instead of "1st Year"
            else if (record.program || yearStr.includes("year") || yearStr.includes("nd") || yearStr.includes("rd") || yearStr.includes("th") || !isNaN(parseInt(yearStr))) {
                catKey = "higherEducation";
                // If year is just "1", convert to "1st Year", otherwise keep as is
                const num = parseInt(yearStr);
                gradeLabel = isNaN(num) ? record.year : `${num}${getOrdinal(num)} Year`;
                sortOrder = num || 99;
            }

            // --- BUILD THE TREE ---
            if (catKey) {
                // If this Grade Level doesn't exist in the category yet, create it
                if (!categories[catKey][gradeLabel]) {
                    categories[catKey][gradeLabel] = {
                        gradeLevel: gradeLabel,
                        sortKey: sortOrder,
                        sections: []
                    };
                }

                // Push the section details
                categories[catKey][gradeLabel].sections.push({
                    name: record.section,
                    adviser: record.adviserName,
                    studentCount: record.studentCount
                });
            }
        });

        // STEP 3: Format into the Final Array
        const finalOutput = [
            "preschool",
            "primaryEducation",
            "intermediate",
            "juniorHighSchool",
            "seniorHighSchool",
            "higherEducation"
        ].map(key => {
            const levelsObj = categories[key];
            const levelsArr = Object.values(levelsObj).sort((a, b) => a.sortKey - b.sortKey);

            // Clean up the sortKey before sending
            levelsArr.forEach(l => delete l.sortKey);

            return {
                category: key,
                levels: levelsArr
            };
        });

        res.status(200).json(finalOutput);

    } catch (error) {
        next(error);
    }
}

const debugSectionMismatch = async (req, res, next) => {
    try {
        // 1. Get all distinct sections from Students
        const studentSections = await Student.distinct("section");

        // 2. Get all distinct sections from Advisers
        const adviserSections = await classAdviser.distinct("section");

        // 3. Find missing ones
        const sectionsWithNoAdviser = studentSections.filter(
            sSection => !adviserSections.includes(sSection)
        );

        res.json({
            status: "DEBUG_REPORT",
            totalStudentSections: studentSections.length,
            totalAdviserSections: adviserSections.length,

            // This list shows sections that exist in Students but failed to match an Adviser
            mismatchedSections: sectionsWithNoAdviser,

            // Raw lists to visually compare (look for casing or spaces)
            studentSectionsList: studentSections.sort(),
            adviserSectionsList: adviserSections.sort()
        });
    } catch (error) {
        next(error);
    }
}
// Don't forget to export and add to routes temporarily!

export {
    getAllClassAdvisers,
    getProgramsAndSections,
    debugSectionMismatch
}