// controllers/studentController.js
import Student from '../models/student.js'
import User from '../models/users.js'

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

//Add a new user
const createUser = async (req, res, next) => {
  try {
    const newUser = new User(req.body);
    await newUser.save();
    res.status(201).json(newUser);
  } catch (error) {
    next(error)
  }
}

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

// Update mealEligibilityStatus to "Claimed"
const claimMeal = async (req, res, next) => {
  try {
    //searching for the student
    const student = await Student.findOne({ studentID: req.params.studentID });

    //if student does not exist, it will return an error message
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    //if the student is 'Waived'
    if (student.mealEligibilityStatus = 'Waived') {
      return res.status(404).json({ message: 'Student is currently Waived!' });
    }

    //if the student is already 'Claimed'
    if (student.mealEligibilityStatus = 'Claimed') {
      return res.status(404).json({ message: 'Student is already claimed!' });
    }

    //if the student is 'Ineligible'
    if (student.mealEligibilityStatus = 'Ineligible') {
      return res.status(404).json({ message: 'Student is Ineligible' });
    }

    //if the student is 'Eligible'
    if (student.mealEligibilityStatus = 'Eligible') {
      //check if there is sufficient balance
      if (student.creditValue != 60) {
        res.status(404).json({message: "Insufficient Balance!"})
      }
      student.mealEligibilityStatus = 'Claimed';
      await student.save();
      // Display the required information
      const responseData = {
        studentID: student.studentID,
        Name: student.name,
        Course: student.course,
        mealEligibilityStatus: student.mealEligibilityStatus,
        creditValue: student.creditValue // Include creditValue in the response
      };
      res.json(responseData);
    }

  } catch (error) {
    next(error);
  }
};

// --- New function to deduct creditValue ---
const deductCredits = async (req, res, next) => {
  try {
    const student = await Student.findOne({ studentID: req.params.studentID });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const { creditTaken } = req.body; // Expect creditTaken in the request body

    if (typeof creditTaken !== 'number' || creditTaken < 0) {
      return res.status(400).json({ message: 'Invalid creditTaken value. Must be a non-negative number.' });
    }

    if (student.creditValue < creditTaken) {
      return res.status(400).json({ message: 'Not enough credit value to deduct.' });
    }

    student.creditValue -= creditTaken; // Deduct credits
    await student.save();

    // Display the updated student information
    const responseData = {
      studentID: student.studentID,
      Name: student.name,
      Course: student.course,
      mealEligibilityStatus: student.mealEligibilityStatus,
      creditValue: student.creditValue // Display the new creditValue
    };

    res.json(responseData);
  } catch (error) {
    next(error);
  }
};

export {
  createStudent,
  createUser,
  getAllStudents,
  getStudentById,
  claimMeal,
  deductCredits
}