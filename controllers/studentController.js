// controllers/studentController.js
import Student from '../models/student.js';
import csv from 'csv-parser';
import stream from 'stream';
import SectionProgram from "../models/sectionprogram.js"
import ProgramSchedule from "../models/ProgramSchedule.js";

import { logWaiveStatus, logEligibilityStatus } from "./loggerController.js";


// Add a new student
const createStudent = async (req, res, next) => {
  try {
    // 1. Destructure all fields
    const {
      studentID,
      first_name,
      middle_name,
      last_name,
      section,
      program,
      year,
      academicStatus
    } = req.body;

    // 2. Validate Required Fields
    if (!studentID || !first_name || !last_name || !middle_name || !year) {
      return res.status(400).json({ message: "Missing required fields: ID, First Name, Middle Name, Last Name, or Year." });
    }

    // 3. Logic Check: Basic Ed vs Higher Ed
    if (!section && !program) {
      return res.status(400).json({ message: "Student must belong to either a Section (Basic Ed) or Program (Higher Ed)." });
    }

    // 4. Duplicate Check: Student ID
    const existingStudent = await Student.findOne({ studentID });
    if (existingStudent) {
      return res.status(409).json({ message: `Student ID '${studentID}' already exists.` });
    }

    // 5. Create the Student
    const newStudent = new Student({
      studentID,
      first_name: first_name.trim(),
      middle_name: middle_name ? middle_name.trim() : "",
      last_name: last_name.trim(),
      section: section ? section.trim() : null,
      program: program ? program.trim() : null,
      year,
      academicStatus: academicStatus || undefined,
      claimRecords: []
    });

    await newStudent.save();

    // 🟢 6. UPDATE STUDENT COUNT (New Logic)
    // We search for the Section/Program document that matches this student's details
    // and increase the count by 1.
    const updateQuery = { year: year };

    // Add the specific filter (Section takes priority if both exist, or handle logic as needed)
    if (section) {
      updateQuery.section = section.trim();
    } else if (program) {
      updateQuery.program = program.trim();
    }

    await SectionProgram.findOneAndUpdate(
      updateQuery,
      { $inc: { studentCount: 1 } } // $inc creates the field if it doesn't exist
    );

    // 7. Socket.io Broadcast
    const io = req.app.get('socketio');
    if (io) {
      io.emit('update-student-register', { type: 'All-Students', message: 'Update Student Register' });
      console.log('🔔 Socket Emitted to all student clients');
    } else {
      console.error('❌ Socket.io not found');
    }

    res.status(201).json({
      message: "Student created successfully",
      data: newStudent
    });

  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: "Validation Error", errors: messages });
    }
    next(error);
  }
};

// Fetch all student data
const getAllStudents = async (req, res, next) => {
  try {
    const students = await Student.find({});
    res.json(students);
  } catch (error) {
    next(error);
  }
};

// Fetch student data by ID
const getStudentById = async (req, res, next) => {
  try {
    const student = await Student.findOne({ studentID: req.params.studentID });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json(student);
  } catch (error) {
    next(error);
  }
};

//fetch student by section
const getStudentBySection = async (req, res, next) => {
  try {
    const students = await Student.find({ section: req.params.sectionName });
    if (!students) {
      return res.status(404).json({ message: `cant find students in ${sectionName} section` })
    }
    res.json({ students });
  } catch (error) {
    next(error);
  }
}

//Create students from CSV
const creteStudentFromCSV = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ message: "No CSV file uploaded" });
  }

  const rawStudentData = [];
  const bufferStream = new stream.Readable();
  bufferStream.push(req.file.buffer);
  bufferStream.push(null);

  let parseError = null;

  bufferStream
    .pipe(csv())
    .on('data', (data) => {
      rawStudentData.push(data);
    })
    .on('end', async () => {
      if (parseError) return;

      if (rawStudentData.length === 0) {
        return res.status(400).json({ message: "CSV is empty or headers are incorrect, please check." });
      }

      try {
        // =========================================================
        // 🟢 1. VALIDATE DATA & CATCH MISSING FIELDS
        // =========================================================
        const validStudentData = [];
        const failedRows = [];
        const totalIndicated = rawStudentData.length;

        rawStudentData.forEach((row, index) => {
          // Add or remove fields here based on your Mongoose Schema's required fields
          const hasStudentID = row.studentID && row.studentID.trim() !== "";
          const hasFirstName = row.firstName && row.firstName.trim() !== "";
          const hasLastName = row.lastName && row.lastName.trim() !== "";

          if (!hasStudentID || !hasFirstName || !hasLastName) {
            failedRows.push({
              rowNumber: index + 2, // +2 because index is 0-based and row 1 is usually the CSV header
              studentID: row.studentID || "MISSING",
              reason: "Missing required fields (studentID, firstName, or lastName)."
            });
          } else {
            validStudentData.push(row);
          }
        });

        // =========================================================
        // 🟢 2. CHECK FOR DUPLICATES BEFORE INSERTING
        // =========================================================

        let addedCount = 0;
        let duplicateCount = 0;
        let newStudentsToInsert = [];

        if (validStudentData.length > 0) {
          const incomingIDs = validStudentData.map(student => student.studentID).filter(Boolean);

          const existingStudents = await Student.find({ studentID: { $in: incomingIDs } }).select('studentID').lean();
          const existingIDSet = new Set(existingStudents.map(s => s.studentID));

          newStudentsToInsert = validStudentData.filter(student => !existingIDSet.has(student.studentID));

          duplicateCount = validStudentData.length - newStudentsToInsert.length;

          if (newStudentsToInsert.length > 0) {
            const addedStudents = await Student.insertMany(newStudentsToInsert, { ordered: false });
            addedCount = addedStudents.length;
          }
        }

        // =========================================================
        // 🟢 3. SYNC PROGRAM SCHEDULES
        // =========================================================

        // We only want to sync schedules for valid rows
        if (validStudentData.length > 0) {
          const uniqueSchedules = new Map();

          validStudentData.forEach(row => {
            const pName = (row.programName || row.program || row.course || "").trim();
            const pYear = (row.year || row.yearLevel || "").trim();

            if (pName && pYear) {
              const compositeKey = `${pName}-${pYear}`;
              if (!uniqueSchedules.has(compositeKey)) {
                uniqueSchedules.set(compositeKey, {
                  programName: pName,
                  year: pYear,
                  dayOfWeek: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"],
                  status: ["PENDING"]
                });
              }
            }
          });

          const schedulePayload = Array.from(uniqueSchedules.values());

          if (schedulePayload.length > 0) {
            const bulkOps = schedulePayload.map(schedule => ({
              updateOne: {
                filter: { programName: schedule.programName, year: schedule.year },
                update: { $setOnInsert: schedule },
                upsert: true
              }
            }));

            await ProgramSchedule.bulkWrite(bulkOps, { ordered: false });
            console.log(`✅ Synced Program Schedules safely.`);
          }
        }

        // =========================================================
        // 🟢 4. RESPOND WITH DETAILED METRICS
        // =========================================================

        // Determine appropriate status code based on if anything was actually processed
        const statusCode = (addedCount > 0 || duplicateCount > 0) ? 201 : 200;

        return res.status(statusCode).json({
          message: "CSV processing completed.",
          metrics: {
            totalIndicated: totalIndicated,
            added: addedCount,
            skippedDuplicates: duplicateCount,
            failedValidation: failedRows.length
          },
          errors: failedRows.length > 0 ? failedRows : null
        });

      } catch (error) {
        console.error("Mongoose insert bulk error:", error);
        return res.status(500).json({ message: "An error occurred during processing.", details: error.message });
      }
    })
    .on('error', (error) => {
      parseError = error;
      next({ status: 400, message: "Error parsing CSV File" });
    });
};

//function to MANUALLY label the student as WAIVED
const waiveStudent = async (req, res, next) => {
  //check if student data exist
  try {
    const student = await Student.findOne({ studentID: req.params.studentID });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    student.mealEligibilityStatus = 'WAIVED';
    student.save()
    await logWaiveStatus(student.studentID, 'WAIVED')
    return res.status(200).json({ message: `${student.studentID} is now WAIVED` });

  } catch (error) {
    next(error)
  }
}

//function to MANUALLY label the student as ELIGIBLE
const eligibleStudent = async (req, res, next) => {
  //check if student data exist
  try {
    const student = await Student.findOne({ studentID: req.params.studentID });

    if (!student) {
      return res.status(404).json({ message: "Student not found" })
    }

    student.mealEligibilityStatus = 'ELIGIBLE';
    student.creditValue = 60;
    await logEligibilityStatus(student.studentID, 'ELIGIBLE')
    student.save()
    return res.status(200).json({ message: `${student.studentID} is now ELIGIBLE` });
  } catch (error) {
    next(error);
  }
}

const studentRFIDLinking = async (req, res, next) => {
  try {
    // 1. Find the student using the ID from the URL parameters
    const student = await Student.findOne({ studentID: req.params.studentID });

    // 2. Validate: Did we find a student?
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found.'
      });
    }

    // 3. Get the new RFID tag. 
    // Best Practice: Use req.body for data updates, not req.params.
    const { rfidTag } = req.body;

    if (!rfidTag) {
      return res.status(400).json({
        success: false,
        message: 'rfidTag is required in the request body.'
      });
    }

    // 4. Validate: Check if this RFID is already assigned to *another* student
    // This prevents two students from sharing the same card.
    const existingUser = await Student.findOne({ rfidTag });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'This RFID tag is already linked to another student.'
      });
    }

    // 5. Update and Save
    student.rfidTag = rfidTag;
    await student.save();

    // 6. Send success response
    res.status(200).json({
      success: true,
      message: 'RFID linked successfully.',
      data: {
        studentID: student.studentID,
        rfidTag: student.rfidTag,
        name: `${student.first_name} ${student.last_name}`
      }
    });

  } catch (error) {
    next(error);
  }
}

const fetchProgramCodes = async (req, res, next) => {
  try {
    // 🟢 STAGE 1: Aggregate (Get all unique pairs from DB)
    const uniquePairs = await Student.aggregate([
      {
        $match: {
          program: { $exists: true } // Basic check only
        }
      },
      {
        $group: {
          _id: {
            program: "$program",
            year: "$year"
          }
        }
      },
      {
        $sort: { "_id.program": 1, "_id.year": 1 }
      }
    ]);

    // 🟢 STAGE 2: Filter the Output (Remove "null" strings here)
    const formattedList = uniquePairs
      // Filter: Exclude if program is literally the string "null"
      .filter(item => item._id.program !== "null" && item._id.program !== null)
      // Map: Format to string
      .map(item => `${item._id.program} - ${item._id.year}`);

    res.status(200).json({
      message: "Unique Program-Year pairs fetched",
      count: formattedList.length,
      data: formattedList
    });

  } catch (error) {
    next(error);
  }
};

const fetchStudentsByProgramCodes = async (req, res, next) => {
  try {
    // Expecting body: { "programCodes": ["BSIT - 1", "ACT - 2"] }
    const { programCodes } = req.body;

    // 1. Validation
    if (!programCodes || !Array.isArray(programCodes) || programCodes.length === 0) {
      return res.status(400).json({ message: "Please provide a valid array of program codes." });
    }

    // 2. Parse the Codes into Query Objects
    // "BSIT - 1"  -->  { program: "BSIT", year: "1" }
    const queryCriteria = programCodes.map(code => {
      const parts = code.split(' - ');

      // Safety check for malformed strings
      if (parts.length < 2) return null;

      return {
        program: parts[0].trim(),
        year: parts[1].trim()
      };
    }).filter(item => item !== null); // Remove invalid entries

    if (queryCriteria.length === 0) {
      return res.status(400).json({ message: "No valid program codes could be parsed." });
    }

    console.log("🔍 Searching for criteria:", queryCriteria);

    // 3. Fetch All Matches in ONE Query
    // The $or operator works like: Match (Criteria 1) OR (Criteria 2) OR ...
    const students = await Student.find({
      $or: queryCriteria
    });

    // 4. Respond
    res.status(200).json({
      message: "Students fetched successfully",
      count: students.length,
      data: students
    });

  } catch (error) {
    next(error);
  }
};


export {
  createStudent,
  getAllStudents,
  getStudentById,
  creteStudentFromCSV,
  waiveStudent,
  eligibleStudent,
  getStudentBySection,
  studentRFIDLinking,
  fetchProgramCodes,
  fetchStudentsByProgramCodes
}