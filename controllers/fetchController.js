import Student from "../models/student.js";
import classAdviser from "../models/classAdviser.js";

import eligibilityBasicEd from "../models/eligibilityBasicEd.js"
import eligibilityHigherEd from "../models/eligibilityHigherEd.js";
import Event from "../models/event.js"

import claimRecord from "../models/claimRecord.js"

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

export {
  getUnifiedSchoolData,
  getAllClassAdvisers,
  getAllBasicEducationMealRequest,
  getAllHigherEducationMealRequest,
  getAllEvents,
  getTodayClaimRecord
}
