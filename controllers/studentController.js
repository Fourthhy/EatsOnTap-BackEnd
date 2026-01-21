// controllers/studentController.js
import Student from '../models/student.js';
import csv from 'csv-parser';
import stream from 'stream';
import SectionProgram from "../models/sectionprogram.js"

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
  //checking if there is an file uploaded
  if (!req.file) {
    return res.status(400).json({ message: "no CSV file uploaded" });
  }

  const studentData = [];

  //create a readable stream from the buffer (in the config)
  const bufferStream = new stream.Readable();
  bufferStream.push(req.file.buffer);
  bufferStream.push(null); //end of the stream buffering 

  let parseError = null;

  bufferStream
    .pipe(csv())
    .on('data', (data) => {
      studentData.push(data)
    })
    .on('end', async () => {
      if (parseError) return;
      if (studentData.length === 0) {
        return res.status(400).json({ message: "CSV is empty or headers are incorrect, please check" });
      }
      try {
        //bulking insert all documents

        const addedStudents = await Student.insertMany(studentData, { ordered: false });

        res.status(201).json({ message: `Successfully Created ${addedStudents.length} students` });
      } catch (error) {
        console.error("Mongoose insert bulk error:", error.message);
        return res.status(400).json({ message: "Bulk insertion failed" })
      }
    })
    .on('error', (error) => {
      parseError = error;
      next({ status: 400, message: "Error entering CSV File" })
    })
}

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


export {
  createStudent,
  getAllStudents,
  getStudentById,
  creteStudentFromCSV,
  waiveStudent,
  eligibleStudent,
  getStudentBySection,
  studentRFIDLinking
}