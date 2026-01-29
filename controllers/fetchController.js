import Student from "../models/student.js";
import classAdviser from "../models/classAdviser.js";

import eligibilityBasicEd from "../models/eligibilityBasicEd.js"
import eligibilityHigherEd from "../models/eligibilityHigherEd.js";
import Event from "../models/event.js"

import claimRecord from "../models/claimRecord.js"

import SectionProgram from "../models/sectionprogram.js"

const getUnifiedSchoolData = async (req, res) => {
  try {
    // 

    // 1. Fetch Students and Advisers in parallel
    const [students, advisers] = await Promise.all([
      Student.find({}).lean(),
      classAdviser.find({}).lean()
    ]);

    // 2. Create Adviser Map (O(1) Lookup)
    const adviserMap = {};
    advisers.forEach(adv => {
      const fullName = `${!adv.honorific ? "" : adv.honorific} ${adv.first_name} ${adv.last_name}`.trim();
      adviserMap[adv.section] = fullName;
    });

    // 3. Initialize Buckets (Keys match Frontend IDs)
    // 🟢 CHANGED: Keys are now camelCase to match GenericTable tabs
    const departmentsMap = {
      "preschool": {},
      "primaryEducation": {},
      "intermediate": {},
      "juniorHighSchool": {},
      "seniorHighSchool": {},
      "higherEducation": {}
    };

    const parseYear = (yearStr) => parseInt(yearStr, 10);

    // 4. Bucket Sort
    students.forEach(student => {
      let deptKey = "";
      const yearVal = parseYear(student.year);

      // Determine Department ID
      if (student.program) {
        deptKey = "higherEducation";
      } else if (student.section) {
        if (isNaN(yearVal) || yearVal === 0) deptKey = "preschool";
        else if (yearVal >= 1 && yearVal <= 3) deptKey = "primaryEducation";
        else if (yearVal >= 4 && yearVal <= 6) deptKey = "intermediate";
        else if (yearVal >= 7 && yearVal <= 10) deptKey = "juniorHighSchool";
        else if (yearVal >= 11 && yearVal <= 12) deptKey = "seniorHighSchool";
        else deptKey = "preschool";
      } else {
        return; // Skip invalid
      }

      // Initialize Year
      if (!departmentsMap[deptKey][student.year]) {
        departmentsMap[deptKey][student.year] = {};
      }

      // Determine Group Name
      const groupName = deptKey === "higherEducation" ? student.program : student.section;

      // Initialize Group
      if (!departmentsMap[deptKey][student.year][groupName]) {
        departmentsMap[deptKey][student.year][groupName] = [];
      }

      // Push Student
      departmentsMap[deptKey][student.year][groupName].push(student);
    });

    // 5. Transform to Array
    const responseData = Object.keys(departmentsMap).map(deptKey => {
      const yearsObj = departmentsMap[deptKey];

      const levels = Object.keys(yearsObj).map(yearKey => {
        const groupsObj = yearsObj[yearKey];

        const groups = Object.keys(groupsObj).map(groupKey => {
          const rawStudentList = groupsObj[groupKey];

          // 🟢 ADDED: Transform Student Data (isLinked logic)
          const processedStudents = rawStudentList.map(s => ({
            id: s._id,
            name: `${s.first_name} ${s.middle_name || ''} ${s.last_name}`.replace(/\s+/g, ' ').trim(),
            studentId: s.studentID,
            type: "Regular", // Default

            // 🟢 THE LOGIC YOU REQUESTED
            isLinked: (s.rfidTag && s.rfidTag.length > 0) ? true : false,

            // Keep raw data just in case
            gradeLevel: s.year,
            program: deptKey === "higherEducation" ? groupKey : null,
            section: deptKey !== "higherEducation" ? groupKey : null
          }));

          const groupObject = {
            section: groupKey, // Standardized key for UI
            studentCount: processedStudents.length,
            students: processedStudents
          };

          if (deptKey === "higherEducation") {
            groupObject.adviser = "N/A";
          } else {
            groupObject.adviser = adviserMap[groupKey] || "Unassigned";
          }

          return groupObject;
        });

        return {
          levelName: yearKey, // 🟢 MATCH FRONTEND: 'levelName' vs 'year'
          sections: groups
        };
      });

      // Sort Levels
      levels.sort((a, b) => {
        const valA = parseYear(a.levelName) || -1;
        const valB = parseYear(b.levelName) || -1;
        return valA - valB;
      });

      return {
        category: deptKey, // 🟢 MATCH FRONTEND: 'category' vs 'department'
        levels: levels
      };
    });

    return res.status(200).json(responseData);

  } catch (error) {
    console.error("Aggregation Error:", error);
    return res.status(500).json({ error: "Failed to aggregate student list" });
  }
};

const getAllClassAdvisers = async (req, res, next) => {


  try {
    const allClassAdvisers = await classAdviser.find();
    if (!allClassAdvisers) {
      res.status(404).json({ message: "There are no Class Advisers!" });
    }
    res.status(200).json(allClassAdvisers)
  } catch (error) {
    next(error)
  }
}

const getAllBasicEducationMealRequest = async (req, res, next) => {
  try {
    const now = new Date();

    // 1. Get the "Calendar Date" string specifically for Philippines
    // This tells us "It is Jan 2nd in Manila", regardless of what the server thinks
    const phDateString = now.toLocaleDateString("en-US", { timeZone: "Asia/Manila" });

    // 2. Create Start of Day
    // We append the time explicitly to force the correct window
    const startOfDay = new Date(new Date(phDateString).toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    startOfDay.setHours(0, 0, 0, 0);

    // FIX: The object above is in Server Time. We need to shift it if the Server is UTC.
    // Actually, an easier way is to define the UTC window manually:

    // --- 🟢 ROBUST OFFSET METHOD ---

    // 1. Get current time
    const current = new Date();

    // 2. Shift 'current' to PH time (UTC + 8 hours)
    // We add 8 hours (in ms) to the UTC time
    const phOffset = 8 * 60 * 60 * 1000;
    const phTimeValue = new Date(current.getTime() + phOffset);

    // 3. Zero out the hours/minutes/seconds to get "Start of PH Day"
    phTimeValue.setUTCHours(0, 0, 0, 0);

    // 4. Shift BACK to UTC to get the database query timestamp
    const queryStart = new Date(phTimeValue.getTime() - phOffset);

    // 5. Create End of Day (Start + 24 hours - 1ms)
    const queryEnd = new Date(queryStart.getTime() + (24 * 60 * 60 * 1000) - 1);

    // Debugging Logs (Remove in production)
    // console.log("Server Time:", current.toISOString());
    // console.log("Query Range (UTC):", queryStart.toISOString(), "to", queryEnd.toISOString());

    const allBasicEducationMealRequest = await eligibilityBasicEd.find({
      timeStamp: {
        $gte: queryStart,
        $lte: queryEnd
      }
    });

    res.status(200).json(allBasicEducationMealRequest);
  } catch (error) {
    next(error);
  }
}

const getAllHigherEducationMealRequest = async (req, res, next) => {
  try {
    // 1. Get current time (Server Time)
    const current = new Date();

    // 2. Shift 'current' to PH time (UTC + 8 hours)
    // We add 8 hours (in ms) to the UTC time
    const phOffset = 8 * 60 * 60 * 1000;
    const phTimeValue = new Date(current.getTime() + phOffset);

    // 3. Zero out the hours/minutes/seconds to get "Start of PH Day"
    phTimeValue.setUTCHours(0, 0, 0, 0);

    // 4. Shift BACK to UTC to get the database query timestamp
    // This gives us the exact UTC moment that "PH Midnight" started
    const queryStart = new Date(phTimeValue.getTime() - phOffset);

    // 5. Create End of Day (Start + 24 hours - 1ms)
    const queryEnd = new Date(queryStart.getTime() + (24 * 60 * 60 * 1000) - 1);

    // 6. Find documents submitted today
    const allHigherEducationMealRequest = await eligibilityHigherEd.find({
      timeStamp: {
        $gte: queryStart,
        $lte: queryEnd
      }
    });

    res.status(200).json(allHigherEducationMealRequest);
  } catch (error) {
    next(error);
  }
}

const getAllEvents = async (req, res, next) => {
  try {
    const allEvents = await Event.find();
    res.status(200).json(allEvents);
  } catch (error) {
    next(error)
  }
}

const getTodayClaimRecord = async (req, res, next) => {
  try {
    // 1. Calculate "Start" and "End" of the current server day
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // 2. Find the single document that matches this time window
    const todayRecord = await claimRecord.findOne({
      claimDate: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });

    if (!todayRecord) {
      console.warn("There are no records!");
    }

    // 3. Return the record
    res.status(200).json(todayRecord);

  } catch (error) {
    next(error);
  }
}

const getStudentClaimReports = async (req, res) => {
  try {
    // 1. Fetch Students and Advisers
    // Optimization: We use .select() to only get the fields we need for this report
    const [students, advisers] = await Promise.all([
      Student.find({})
        .select('first_name middle_name last_name section program year claimRecords')
        .lean(),
      classAdviser.find({}).lean()
    ]);

    // 2. Create Adviser Map (Same as your reference)
    const adviserMap = {};
    advisers.forEach(adv => {
      const fullName = `${!adv.honorific ? "" : adv.honorific} ${adv.first_name} ${adv.last_name}`.trim();
      adviserMap[adv.section] = fullName;
    });

    // 3. Initialize Buckets
    const departmentsMap = {
      "preschool": {},
      "primaryEducation": {},
      "intermediate": {},
      "juniorHighSchool": {},
      "seniorHighSchool": {},
      "higherEducation": {}
    };

    const parseYear = (yearStr) => parseInt(yearStr, 10);

    // 4. Bucket Sort (Distribute students into categories/levels)
    students.forEach(student => {
      let deptKey = "";
      const yearVal = parseYear(student.year);

      // Determine Department ID
      if (student.program) {
        deptKey = "higherEducation";
      } else if (student.section) {
        if (isNaN(yearVal) || yearVal === 0) deptKey = "preschool";
        else if (yearVal >= 1 && yearVal <= 3) deptKey = "primaryEducation";
        else if (yearVal >= 4 && yearVal <= 6) deptKey = "intermediate";
        else if (yearVal >= 7 && yearVal <= 10) deptKey = "juniorHighSchool";
        else if (yearVal >= 11 && yearVal <= 12) deptKey = "seniorHighSchool";
        else deptKey = "preschool";
      } else {
        return; // Skip invalid
      }

      // Initialize Year Level
      if (!departmentsMap[deptKey][student.year]) {
        departmentsMap[deptKey][student.year] = {};
      }

      // Determine Group Name (Program for HigherEd, Section for BasicEd)
      const groupName = deptKey === "higherEducation" ? student.program : student.section;

      // Initialize Group
      if (!departmentsMap[deptKey][student.year][groupName]) {
        departmentsMap[deptKey][student.year][groupName] = [];
      }

      // Push Student to the bucket
      departmentsMap[deptKey][student.year][groupName].push(student);
    });

    // 5. Transform to Final Output Array
    const responseData = Object.keys(departmentsMap).map(deptKey => {
      const yearsObj = departmentsMap[deptKey];

      const levels = Object.keys(yearsObj).map(yearKey => {
        const groupsObj = yearsObj[yearKey];

        const groups = Object.keys(groupsObj).map(groupKey => {
          const rawStudentList = groupsObj[groupKey];

          // 🟢 TARGETED CHANGE: Map only the fields you requested
          const processedStudents = rawStudentList.map(s => ({
            // Composed Name
            name: `${s.first_name} ${s.middle_name || ''} ${s.last_name}`.replace(/\s+/g, ' ').trim(),

            // Section & Grade Level
            section: deptKey === "higherEducation" ? groupKey : s.section,
            gradeLevel: s.year,

            // ✅ Claim Records (The core requirement)
            claimRecords: s.claimRecords || []
          }));

          const groupObject = {
            section: groupKey,
            studentCount: processedStudents.length,
            students: processedStudents
          };

          // Attach Adviser (Preserving structure)
          if (deptKey === "higherEducation") {
            groupObject.adviser = "N/A";
          } else {
            groupObject.adviser = adviserMap[groupKey] || "Unassigned";
          }

          return groupObject;
        });

        return {
          levelName: yearKey,
          sections: groups
        };
      });

      // Sort Levels numerically
      levels.sort((a, b) => {
        const valA = parseYear(a.levelName) || -1;
        const valB = parseYear(b.levelName) || -1;
        return valA - valB;
      });

      return {
        category: deptKey,
        levels: levels
      };
    });

    // 6. Return Data
    return res.status(200).json(responseData);

  } catch (error) {
    console.error("Claim Report Error:", error);
    return res.status(500).json({ error: "Failed to generate claim report" });
  }
};

const getAllSectionProgramList = async (req, res, next) => {
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

const getClassAdvisers = async (req, res, next) => {
  try {
    // 1. Fetch data but EXCLUDE email and password immediately
    // .lean() converts Mongoose documents to plain JS objects (faster for read-only)
    const advisers = await ClassAdviser.find({})
      .select('-email -password')
      .lean();

    // 2. Transform the data to combine names
    const formattedData = advisers.map(adviser => {
      // Check if middle name exists to avoid double spaces
      const middle = adviser.middle_name ? ` ${adviser.middle_name}` : '';

      return {
        _id: adviser._id, // Keep the mongo ID if needed
        userID: adviser.userID,
        name: `${adviser.honorific} ${adviser.first_name}${middle} ${adviser.last_name}`,
        role: adviser.role,
        section: adviser.section
      };
    });

    // 3. Send the transformed list
    res.status(200).json(formattedData);

  } catch (error) {
    next(error);
  }
};

const getStudentsWithProgramOnly = async (req, res, next) => {
  try {
    // Logic:
    // 1. Program must exist and not be empty/null
    // 2. Section must be either missing, null, or an empty string
    const students = await Student.find({
      program: { $exists: true, $ne: null, $ne: "" },
      $or: [
        { section: { $exists: false } },
        { section: null },
        { section: "" }
      ]
    });

    if (students.length === 0) {
      return res.status(404).json({ message: "No students found with only a Program defined." });
    }

    res.status(200).json({
      message: "Successfully fetched Higher Education students",
      count: students.length,
      data: students
    });

  } catch (error) {
    next(error);
  }
};

const getSchoolStructure = async (req, res, next) => {
    try {
        // 1. Fetch only necessary fields (Optimization)
        // We only need year, section, and program to determine the structure.
        const students = await Student.find({}, 'year section program').lean();

        // 2. Initialize Buckets (Keys match your Frontend IDs)
        const departmentsMap = {
            "preschool": {},
            "primaryEducation": {},
            "intermediate": {},
            "juniorHighSchool": {},
            "seniorHighSchool": {},
            "higherEducation": {}
        };

        const parseYear = (yearStr) => parseInt(yearStr, 10);

        // 3. Bucket Sort (Populate the structure)
        students.forEach(student => {
            let deptKey = "";
            const yearVal = parseYear(student.year);

            // A. Determine Department ID
            if (student.program) {
                deptKey = "higherEducation";
            } else if (student.section) {
                // Logic for Basic Education based on Year Level
                if (isNaN(yearVal) || yearVal === 0) deptKey = "preschool";
                else if (yearVal >= 1 && yearVal <= 3) deptKey = "primaryEducation";
                else if (yearVal >= 4 && yearVal <= 6) deptKey = "intermediate";
                else if (yearVal >= 7 && yearVal <= 10) deptKey = "juniorHighSchool";
                else if (yearVal >= 11 && yearVal <= 12) deptKey = "seniorHighSchool";
                else deptKey = "preschool"; // Fallback
            } else {
                return; // Skip invalid records (no section AND no program)
            }

            // B. Initialize Year Level Bucket
            // Note: We use the raw 'student.year' string for the key to preserve format
            if (!departmentsMap[deptKey][student.year]) {
                departmentsMap[deptKey][student.year] = new Set(); // Use Set to avoid duplicates
            }

            // C. Determine Section/Course Name
            // If Higher Ed, use 'program' (e.g., BSIT). If Basic Ed, use 'section' (e.g., Rizal).
            const entryName = deptKey === "higherEducation" ? student.program : student.section;

            // D. Add to Set (Unique names only)
            if (entryName) {
                departmentsMap[deptKey][student.year].add(entryName);
            }
        });

        // 4. Transform to Final Array Structure
        const responseData = Object.keys(departmentsMap).map(deptKey => {
            const yearsObj = departmentsMap[deptKey];

            // Map Years
            const levels = Object.keys(yearsObj).map(yearKey => {
                // Convert Set back to Array and Sort alphabetically
                const sectionsList = Array.from(yearsObj[yearKey]).sort();

                return {
                    levelName: yearKey,
                    sections: sectionsList // Simple array of strings: ["Faith", "Hope", "Love"]
                };
            });

            // Sort Levels Numerically (1, 2, 3...)
            levels.sort((a, b) => {
                const valA = parseYear(a.levelName) || -1;
                const valB = parseYear(b.levelName) || -1;
                return valA - valB;
            });

            return {
                category: deptKey, // e.g., "primaryEducation"
                levels: levels     // Array of years containing sections
            };
        });

        // 5. Filter out empty departments (Optional, keeps response clean)
        const cleanResponse = responseData.filter(dept => dept.levels.length > 0);

        return res.status(200).json(cleanResponse);

    } catch (error) {
        console.error("Structure Fetch Error:", error);
        next(error);
    }
};

export {
  getUnifiedSchoolData,
  getAllClassAdvisers,
  getAllBasicEducationMealRequest,
  getAllHigherEducationMealRequest,
  getAllEvents,
  getTodayClaimRecord,
  getStudentClaimReports,
  getAllSectionProgramList,
  getClassAdvisers,
  getStudentsWithProgramOnly,
  getSchoolStructure
}
