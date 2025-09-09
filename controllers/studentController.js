// controllers/studentController.js
import Student from '../models/studnet.js'

//Either way pwede naman ganito, but titignan pa
// const Student = require('../models/student.js');

// Add a new student
exports.createStudent = async (req, res, next) => {
  try {
    const newStudent = new Student(req.body);
    await newStudent.save();
    res.status(201).json(newStudent);
  } catch (error) {
    next(error); // Pass error to error handling middleware
  }
};

// Fetch all student data
exports.getAllStudents = async (req, res, next) => {
  try {
    const students = await Student.find({});
    res.json(students);
  } catch (error) {
    next(error);
  }
};

// Fetch student data by ID
exports.getStudentById = async (req, res, next) => {
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

// Update mealEligibilityStatus to "Claimed"
exports.claimMeal = async (req, res, next) => {
  try {
    const student = await Student.findOne({ studentID: req.params.studentID });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    student.mealEligibilityStatus = 'Claimed';
    await student.save();

    // Display the required information
    const responseData = {
      studentID: student.studentID,
      Name: student.name,
      Course: student.course,
      mealEligibilityStatus: student.mealEligibilityStatus,
    };

    res.json(responseData);
  } catch (error) {
    next(error);
  }
};