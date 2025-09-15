// app.js
const express = require('express');
const bodyParser = require('body-parser');
const studentRoutes = require('./routes/studentRoutes');
const errorHandler = require('./middlewares/eventHandler'); // <-- Ensure this path is correct

const app = express();

// Middleware
app.use(bodyParser.json());

// Routes
app.use('/api', studentRoutes); // Prefix all student routes with /api

// Error Handling Middleware (must be last)
app.use(errorHandler); // <-- This is where the middleware is applied

module.exports = app;