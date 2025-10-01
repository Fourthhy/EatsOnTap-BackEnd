// app.js
const express = require('express');
const bodyParser = require('body-parser');
const studentRoutes = require('./routes/studentRoutes');
const userRoutes = require('./routes/userRoutes');
const loggerRoutes = require('./routes/loggerRoutes');
const claimRoutes = require('./routes/claimRoutes')
const errorHandler = require('./middlewares/eventHandler'); // <-- Ensure this path is correct

const app = express();

// Middleware
app.use(bodyParser.json());

// Routes
app.use('/api/students', studentRoutes); // Prefix all student routes with /api/students
app.use('/api/users', userRoutes) //Prefix all user routes with /api/useres
app.use('/api/logger', loggerRoutes) //Prefix all logger routes with /api/logger
app.use('/api/claim', claimRoutes) //Prefix all claim routes with /api/claim

// Error Handling Middleware (must be last)
app.use(errorHandler); // <-- This is where the middleware is applied

module.exports = app;