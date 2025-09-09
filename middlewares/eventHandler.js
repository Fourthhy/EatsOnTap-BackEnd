// middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  console.error(err.stack); // Log the error stack for debugging
  res.status(err.statusCode || 500).json({
    message: err.message || 'Something went wrong on the server',
  });
};

module.exports = errorHandler;