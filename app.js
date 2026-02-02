// use npm run dev to run the backend localhost with nodemon

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser'); // 🟢 1. Import it here

// ... imports ...
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
const programScheduleRoutes = require('./routes/programScheduleRoutes');
const schedulerRoutes = require('./routes/schedulerRoutes');
const systemLoggerRoutes = require('./routes/systemLoggerRoutes')
const mealValueRoutes = require('./routes/mealValueRoutes');
const reportRoutes = require('./routes/reportRoutes');

//for development purposes
const developerRoutes = require('./routes/developerRouter');

const errorHandler = require('./middlewares/eventHandler');

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'https://eats-on-tap-front-end.vercel.app'
];

// 1. Define CORS options
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
  credentials: true, // This allows the cookie to pass through
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// 2. Apply CORS middleware globally FIRST
app.use(cors(corsOptions));

// 3. Handle Preflight requests specifically
app.options(/(.*)/, cors(corsOptions));

// 🟢 4. Cookie Parser (MIDDLEWARE ORDER IS IMPORTANT)
// This must be BEFORE your routes so req.cookies is available in the controllers
app.use(cookieParser());

// 5. Body parser
app.use(bodyParser.json());

// Routes
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
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/programSchedule', programScheduleRoutes);
app.use('/api/sectionprogram', sectionprogramRoutes);
app.use('/api/systemlogger', systemLoggerRoutes);
app.use('/api/mealvalue', mealValueRoutes);
app.use('/api/report', reportRoutes);


//for development purposes
app.use('/api/dev', developerRoutes);

// Error Handling Middleware (must be last)
app.use(errorHandler);

module.exports = app;