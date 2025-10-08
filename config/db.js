// config/db.js
const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI;

const connectDB = async () => {
  try {
    mongoose.set('debug', true);
    await mongoose.connect(MONGODB_URI, {
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

