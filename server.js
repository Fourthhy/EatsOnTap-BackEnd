require('dotenv').config()
const scheduler = require('./utils/scheduler.js')

// server.js
const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

//Start Scheduler
scheduler.startScheduler();

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});