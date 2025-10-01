// controllers/studentController.js
import Student from '../models/student.js'

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


export {
  createStudent,
  getAllStudents,
  getStudentById,
}