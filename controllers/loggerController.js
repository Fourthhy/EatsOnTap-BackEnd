import Logger from '../models/loggers/claimLogger.js'
import statusLogger from '../models/loggers/statusLogger.js'

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

//This function is also used to log remove remaining credit balance from students at the end of the day.
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

// Utility function to safely log and avoid unhandled promise rejections
const logClaimAttempt = async (studentID, action, creditTaken) => {
    try {
        await loggingClaimAttempts(studentID, action, creditTaken);
    } catch (logError) {
        // Log the logging error, but don't prevent the main transaction from proceeding
        console.error(`Failed to save transaction log for ${action}:`, logError);
    }
};

const loggingWaiveStatus = async (studentID, actionTaken)  => {
    try {
        const waiveLogger = new statusLogger({
            studentID: studentID,
            actionTaken: actionTaken
        })
        await waiveLogger.save();
    } catch (error) {
        throw error;
    }
}

const logWaiveStatus = async (studentID, actionTaken) => {
    try {
        await loggingWaiveStatus(studentID, actionTaken); 
    } catch (error) {
        console.error(`Failed to save transaction log for ${actionTaken}:`, error);
    }
}

const loggingEligibleStatus = async (studentID, actionTaken) => {
    try {
        const eligibilityLogger = new statusLogger({
            studentID: studentID,
            actionTaken: actionTaken
        }) 
        await eligibilityLogger.save()
    } catch (error) {
        throw error;
    }
}

const logEligibilityStatus = async (studentID, actionTaken) => {
    try {
        await loggingEligibleStatus(studentID, actionTaken);
    } catch (error) {
        console.error(`Failed to save transaction log for ${actionTaken}:`, error);
    }
}

export {
    getAllLoggingClaimAttempts,
    logClaimAttempt,
    logWaiveStatus,
    logEligibilityStatus
}

