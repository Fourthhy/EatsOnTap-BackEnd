// middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  console.error(err.stack); // Log the error stack for debugging

  // Default status code and message
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong on the server';

  // Handle Mongoose CastError for invalid IDs
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 400;
    message = `Invalid ID: ${err.value}`;
  }

  // Handle Mongoose duplicate key error (e.g., for unique studentID)
  if (err.code === 11000 && err.errmsg && err.errmsg.includes('duplicate key')) {
    statusCode = 409; // Conflict
    // Extract the duplicated field from the error message
    const field = Object.keys(err.keyValue)[0];
    message = `Duplicate field value: ${field}. Please use another value.`;
  }

  res.status(statusCode).json({
    message: message,
  });
};

module.exports = errorHandler;