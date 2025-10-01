// controllers/studentController.js
import Student from '../models/student.js'
import User from '../models/users.js'
import Logger from '../models/logger.js'

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

//Fetch all log records
const getAllLoggingClaimAttempts = async (req, res, next) => {
  try {
    const logger = await Logger.find({})
    res.json(logger);
  } catch (error) {
    next(error)
  }
}

//logging claim attempts
const loggingClaimAttempts = async (studentID, action, creditTaken) => {
  const logger = new Logger({
    studentID: studentID,
    action: action,
    creditTaken: creditTaken
  })
  await logger.save();
}

// Update mealEligibilityStatus to "Claimed"
const claimMeal = async (req, res, next) => {
  try {
    //searching for the student
    const student = await Student.findOne({ studentID: req.params.studentID });

    //if student does not exist, it will return an error message
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    switch (student.mealEligibilityStatus) {
      case 'Waived':
        //Logging claim attempt for Waived status
        loggingClaimAttempts(student.studentID, 'CLAIM-ATTEMPT-WAIVED', 0);
        return res.status(404).json({ message: 'Student is currently Waived!' });
      case 'Claimed':
        //Logging claim attempt for already Claimed status
        loggingClaimAttempts(student.studentID, 'CLAIM-ATTEMPT-CLAIMED', 0);
        return res.status(404).json({ message: 'Student is already claimed!' });
      case 'Ineligible':
        //Logging claim attempt for Ineligible Status
        loggingClaimAttempts(student.studentID, 'CLAIM-ATTEMPT-INELIGIBLE', 0)
        return res.status(404).json({ message: 'Student is Ineligible' });
      case 'Eligible':
        //check if there is sufficient balance
        if (student.creditValue != 60) {
          loggingClaimAttempts(student.studentID, 'CLAIM-ATTEMPT-INSUFFICIENT-BALANCE', 0)
          return res.status(404).json({ message: "Insufficient Balance!" });
        }

        //Updating student record 
        student.mealEligibilityStatus = 'Claimed';
        student.creditValue = 0;
        await student.save();

        //logging succuess claim attempt
        loggingClaimAttempts(student.studentID, 'CLAIM-FREE-MEAL', 60)

        // Display the required information
        const responseData = {
          studentID: student.studentID,
          Name: student.name,
          Course: student.course,
          mealEligibilityStatus: student.mealEligibilityStatus,
          creditValue: student.creditValue
        };
        return res.json(responseData);
    }
  } catch (error) {
    next(error);
  }
};

const claimFood = async (req, res, next) => {
  try {
    //searching for the student
    const student = await Student.findOne({ studentID: req.params.studentID });

    //if student does not exist, it will return an error message
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    switch (student.mealEligibilityStatus) {
      case 'Waived':
        //Logging claim attempt for Waived status
        loggingClaimAttempts(student.studentID, 'CLAIM-ATTEMPT-WAIVED', 0);
        return res.status(404).json({ message: 'Student is currently Waived!' });
      case 'Claimed':
        //Logging claim attempt for already Claimed status
        loggingClaimAttempts(student.studentID, 'CLAIM-ATTEMPT-CLAIMED', 0);
        return res.status(404).json({ message: 'Student is already claimed!' });
      case 'Ineligible':
        //Logging claim attempt for Ineligible Status
        loggingClaimAttempts(student.studentID, 'CLAIM-ATTEMPT-INELIGIBLE', 0)
        return res.status(404).json({ message: 'Student is Ineligible' });
      case 'Eligible':
        //check if the balance is not 0
        if (student.creditValue == 0) {
          loggingClaimAttempts(student.studentID, 'CLAIM-ATTEMPT-NO-BALANCE', 0);
          return res.status(404).json({ message: "No Balance" });
        }

        const { creditTaken } = req.body; // Expect creditTaken in the request body
        //checking if the credit taken is greater than the current credit value
        if (creditTaken > student.creditValue) {
          loggingClaimAttempts(student.studentID, 'CLAIM-ATTEMPT-INSUFFICIENT-BALANCE', 0)
          return res.status(404).json({ message: "Inssuficient balance!" });
        }

        //checking if there is any balance left
        const creditChange = student.creditValue - creditTaken;
        //if there isn't credit left, the student will be deemed "Claimed"
        if (creditChange == 0) {
          student.mealEligibilityStatus = "Claimed";
        }

        //Updating student record 
        student.creditValue = creditChange;
        await student.save();

        //logging succuess claim attempt
        loggingClaimAttempts(student.studentID, 'CLAIM-FOOD-ITEM', creditTaken)


        // Display the required information
        const responseData = {
          studentID: student.studentID,
          Name: student.last_namename,
          Course: student.course,
          mealEligibilityStatus: student.mealEligibilityStatus,
          creditValue: student.creditValue
        };
        return res.json(responseData);
    }

  } catch (error) {
    next(error)
  }
}

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

//new function to assign creditValue to student
const assignCreditValue = async (req, res, next) => {
  try {
    const student = await Student.findOne({ studentID: req.params.studentID });
    if (student.creditValue != 0) {
      res.status(404).json({ message: "Student already has credit value" });
    }
    student.creditValue = 60;
    await student.save();
    const responseData = {
      studentID: student.studentID,
      Name: student.last_name,
      creditValue: student.creditValue // Display the new creditValue
    };
    res.status(200).json(responseData);

  } catch (error) {
    next(error);
  }
}

export {
  createStudent,
  createUser,
  getAllStudents,
  getStudentById,
  getAllLoggingClaimAttempts,
  claimMeal,
  claimFood,
  deductCredits,
  assignCreditValue
}