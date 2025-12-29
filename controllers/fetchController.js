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
        const getOrdinal = (n) => {
            const s = ["th", "st", "nd", "rd"];
            const v = n % 100;
            return (s[(v - 20) % 10] || s[v] || s[0]);
        };

        const rawData = await Student.aggregate([
            // 1. NORMALIZE NAME (Program vs Section)
            {
                $addFields: {
                    effectiveName: {
                        $cond: {
                            if: {
                                $and: [
                                    { $ifNull: ["$program", false] },
                                    { $ne: ["$program", ""] }
                                ]
                            },
                            then: "$program",
                            else: "$section"
                        }
                    },
                    isHigherEd: {
                        $cond: {
                            if: {
                                $and: [
                                    { $ifNull: ["$program", false] },
                                    { $ne: ["$program", ""] }
                                ]
                            },
                            then: true,
                            else: false
                        }
                    }
                }
            },
            // 2. GROUP BY NAME & YEAR
            {
                $group: {
                    _id: {
                        name: "$effectiveName",
                        year: "$year"
                    },
                    studentCount: { $sum: 1 },
                    isHigherEd: { $first: "$isHigherEd" },
                    program: { $first: "$program" },
                    section: { $first: "$section" }
                }
            },
            // 3. LOOKUP (JOIN) ADVISER
            {
                $lookup: {
                    // 🟢 Mongoose converts model 'classAdviser' -> collection 'classadvisers'
                    from: "classadvisers",

                    localField: "_id.name", // The Section Name (e.g., "Faith")
                    foreignField: "section", // The Field in ClassAdviser Schema

                    as: "adviserInfo"
                }
            },
            // 4. FORMAT OUTPUT
            {
                $project: {
                    _id: 0,
                    section: "$_id.name",
                    year: "$_id.year",
                    studentCount: 1,
                    program: 1,
                    isHigherEd: 1,
                    adviserName: {
                        $cond: {
                            if: { $eq: ["$isHigherEd", true] },
                            then: null, // College = No Adviser
                            else: {
                                $let: {
                                    vars: { firstAdv: { $arrayElemAt: ["$adviserInfo", 0] } },
                                    in: {
                                        $cond: {
                                            if: { $not: ["$$firstAdv"] },
                                            then: "Unassigned", // Lookup failed or no adviser found
                                            else: {
                                                $concat: [
                                                    { $ifNull: ["$$firstAdv.honorific", ""] },
                                                    " ",
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
                }
            }
        ]);

        // ... (Javascript Processing Logic - Same as before) ...
        // START COPYING HERE
        const categories = {
            preschool: {}, primaryEducation: {}, intermediate: {},
            juniorHighSchool: {}, seniorHighSchool: {}, higherEducation: {}
        };

        rawData.forEach(record => {
            const yearStr = String(record.year).toLowerCase();
            let catKey = null;
            let gradeLabel = null;
            let sortOrder = 99;

            if (yearStr === "pre") { catKey = "preschool"; gradeLabel = "Nursery"; sortOrder = 0; }
            else if (yearStr === "0") { catKey = "preschool"; gradeLabel = "Kindergarten"; sortOrder = 1; }
            else if (!record.isHigherEd && !isNaN(parseInt(yearStr))) {
                const lvl = parseInt(yearStr);
                if (lvl >= 1 && lvl <= 3) { catKey = "primaryEducation"; gradeLabel = `Grade ${lvl}`; sortOrder = lvl; }
                else if (lvl >= 4 && lvl <= 6) { catKey = "intermediate"; gradeLabel = `Grade ${lvl}`; sortOrder = lvl; }
                else if (lvl >= 7 && lvl <= 10) { catKey = "juniorHighSchool"; gradeLabel = `Grade ${lvl}`; sortOrder = lvl; }
                else if (lvl >= 11 && lvl <= 12) { catKey = "seniorHighSchool"; gradeLabel = `Grade ${lvl}`; sortOrder = lvl; }
            }
            else if (record.isHigherEd || !isNaN(parseInt(yearStr))) {
                catKey = "higherEducation";
                const num = parseInt(yearStr);
                gradeLabel = isNaN(num) ? record.year : `${num}${getOrdinal(num)} Year`;
                sortOrder = num || 99;
            }

            if (catKey && categories[catKey]) {
                if (!categories[catKey][gradeLabel]) {
                    categories[catKey][gradeLabel] = {
                        gradeLevel: gradeLabel, sortKey: sortOrder, sections: []
                    };
                }
                categories[catKey][gradeLabel].sections.push({
                    name: record.section, adviser: record.adviserName, studentCount: record.studentCount
                });
            }
        });

        const finalOutput = [
            "preschool", "primaryEducation", "intermediate",
            "juniorHighSchool", "seniorHighSchool", "higherEducation"
        ].map(key => {
            const levelsArr = Object.values(categories[key]).sort((a, b) => a.sortKey - b.sortKey);
            levelsArr.forEach(l => delete l.sortKey);
            return { category: key, levels: levelsArr };
        });

        // END COPYING HERE

        res.status(200).json(finalOutput);

    } catch (error) {
        console.error("Error in getProgramsAndSections:", error);
        next(error);
    }
};

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

const getAllStudents = async (req, res, next) => {
    try {
        // 1. Use .lean() to get plain JSON objects (Faster & Editable)
        const allStudents = await Student.find().lean();

        // 2. Map through the students to add the 'isLinked' property
        const processedStudents = allStudents.map(student => ({
            ...student, // Keep all existing properties (name, id, etc.)

            // 3. Create 'isLinked'. 
            // The '!!' operator converts a string to true, and null/undefined/"" to false.
            isLinked: !!student.rfidTag
        }));

        res.status(200).json(processedStudents);
    } catch (error) {
        next(error);
    }
}

export {
    getAllClassAdvisers,
    getProgramsAndSections,
    debugSectionMismatch,
    getAllStudents
}