// config/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/studentDB', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // useCreateIndex: true, // No longer needed in Mongoose 6+
      // useFindAndModify: false // No longer needed in Mongoose 6+
    });
    console.log('MongoDB connected');
  } catch (err) {
    console.error(`MongoDB connection error: ${err.message}`);
    process.exit(1); // Exit process with failure
  }
};

module.exports = connectDB;