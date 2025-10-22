// app.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const studentRoutes = require('./routes/studentRoutes');
const userRoutes = require('./routes/userRoutes');
const loggerRoutes = require('./routes/loggerRoutes');
const claimRoutes = require('./routes/claimRoutes');
const authRoutes = require('./routes/authRoutes');
const classAdviserRoutes = require('./routes/classAdviserRoutes');
const adminAssistantRoutes = require('./routes/adminAssistantRoutes');
const eligibilityRoutes = require('./routes/eligibilityRoutes');
const adminRoutes = require('./routes/adminRoutes');
const settingRoutes = require('./routes/settingRoutes');
const creditRoutes = require('./routes/creditRoutes');
const eventRoutes = require('./routes/eventRoutes');
const errorHandler = require('./middlewares/eventHandler'); // <-- Ensure this path is correct

const app = express();

//CORS Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'https://https://eats-on-tap-front-end.vercel.app'], // allow from your frontend
    credentials: true // only include this if you send cookies/auth
}));

//body parser
app.use(bodyParser.json());

// Routes
app.use('/api/adminAssistant', adminAssistantRoutes) //Prefix all authentication routes with /api/adminAssistant
app.use('/api/admin', adminRoutes) //Prefix all authentication routes with /api/admin
app.use('/api/auth', authRoutes) //Prefix all authentication routes with /api/auth
app.use('/api/claim', claimRoutes) //Prefix all claim routes with /api/claim
app.use('/api/classAdviser', classAdviserRoutes) //Prefix all authentication routes with /api/classAdviser
app.use('/api/credit', creditRoutes) //Prefix all authentication routes with /api/credit
app.use('/api/eligibility', eligibilityRoutes) //Prefix all authentication routes with /api/eligibility
app.use('/api/event', eventRoutes) //Prefix all event routes with /api/routes
app.use('/api/logger', loggerRoutes) //Prefix all logger routes with /api/logger
app.use('/api/setting', settingRoutes) //Prefix all authentication routes with /api/setting
app.use('/api/students', studentRoutes); // Prefix all student routes with /api/students
app.use('/api/users', userRoutes) //Prefix all user routes with /api/useres

// Error Handling Middleware (must be last)
app.use(errorHandler); // <-- This is where the middleware is applied

module.exports = app;