import Logger from '../models/logger.js'

// Utility function to safely log and avoid unhandled promise rejections
const logClaimAttempt = async (studentID, action, creditTaken) => {
    try {
        await loggingClaimAttempts(studentID, action, creditTaken);
    } catch (logError) {
        // Log the logging error, but don't prevent the main transaction from proceeding
        console.error(`Failed to save transaction log for ${action}:`, logError);
    }
};

// Fetch all log records
const getAllLoggingClaimAttempts = async (req, res, next) => {
    try {
        // Renamed variable for clarity (multiple records)
        const logs = await Logger.find({}) 
        res.json(logs);
    } catch (error) {
        // Pass the error to the Express error handler
        next(error)
    }
}

// logging claim attempts
const loggingClaimAttempts = async (studentID, action, creditTaken) => {
    // CRITICAL FIX: Wrap database operation in try...catch
    try {
        const logger = new Logger({
            studentID: studentID,
            action: action,
            creditTaken: creditTaken
        })
        await logger.save();
    } catch (error) {
        // Crucial: Allow the error to propagate back to the caller 
        // (the logClaimAttempt wrapper in studentController) so it can be handled/logged.
        throw error; 
    }
}

export {
    getAllLoggingClaimAttempts,
    loggingClaimAttempts,
    logClaimAttempt // <-- Export the new wrapper function
}

