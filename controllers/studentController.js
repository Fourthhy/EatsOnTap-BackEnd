// controllers/studentController.js
import Student from '../models/student.js';
import csv from 'csv-parser';
import stream from 'stream';

import { logWaiveStatus, logEligibilityStatus } from "./loggerController.js";


// Add a new student
const createStudent = async (req, res, next) => {
  try {
    const newStudent = new Student(req.body);
    await newStudent.save();
    res.status(201).json(newStudent);
  } catch (error) {
    next(error); // Pass error to error handling middleware
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
    return res.status(200).json({message: `${student.studentID} is now WAIVED`});

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
      return res.status(404).json({ message: "Student not found"})
    }

    student.mealEligibilityStatus = 'ELIGIBLE';
    student.creditValue = 60;
    await logEligibilityStatus(student.studentID, 'ELIGIBLE')
    student.save()
    return res.status(200).json({message: `${student.studentID} is now ELIGIBLE`});
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
  eligibleStudent
}