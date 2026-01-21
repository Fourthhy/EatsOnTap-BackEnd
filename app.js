// use npm run dev to run the backend localhost with nodemon

// app.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// ... imports remain the same ...
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
const fetchRoutes = require('./routes/fetchRoutes');
const sectionprogramRoutes = require('./routes/sectionprogramRoutes');

//for development purposes
const developerRoutes = require('./routes/developerRouter');

const errorHandler = require('./middlewares/eventHandler');


const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'https://eats-on-tap-front-end.vercel.app'
];

// 1. Define CORS options separately so they can be reused
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Array is preferred
  allowedHeaders: ['Content-Type', 'Authorization']
};

// 2. Apply CORS middleware globally with options
app.use(cors(corsOptions));

// 3. Handle Preflight requests specifically
// Use '*' to match ALL routes, and pass the SAME corsOptions
app.options(/(.*)/, cors(corsOptions));

// body parser
app.use(bodyParser.json());

// Routes
// ... routes remain the same ...
app.use('/api/adminAssistant', adminAssistantRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/claim', claimRoutes);
app.use('/api/classAdviser', classAdviserRoutes);
app.use('/api/credit', creditRoutes);
app.use('/api/eligibility', eligibilityRoutes);
app.use('/api/event', eventRoutes);
app.use('/api/fetch', fetchRoutes);
app.use('/api/logger', loggerRoutes);
app.use('/api/setting', settingRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sectionprogram', sectionprogramRoutes);

//for development purposes
app.use('/api/dev', developerRoutes);
// Error Handling Middleware (must be last)
app.use(errorHandler);

module.exports = app;