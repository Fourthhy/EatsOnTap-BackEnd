require('dotenv').config();
const http = require('http');               // 1. Import http module
const { Server } = require('socket.io');    // 2. Import Socket.io
const scheduler = require('./utils/scheduler.js');

// server.js
const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Start Scheduler
scheduler.startScheduler();

// 🟢 3. Create the HTTP Server manually
// Pass your 'app' to it. This acts just like app.listen() but gives us access to the server object.
const server = http.createServer(app);

// 🟢 4. Initialize Socket.io on that server
const io = new Server(server, {
    cors: {
        // Reuse the allowed origins you defined in app.js or list them here
        origin: [
            'http://localhost:5173',
            'https://eats-on-tap-front-end.vercel.app'
        ],
        methods: ["GET", "POST"]
    }
});

// 🟢 5. Store 'io' globally in the app
// This allows you to access 'io' in any controller using req.app.get('socketio')
app.set('socketio', io);

// 🟢 6. Listen on 'server', NOT 'app'
// Important: Use server.listen instead of app.listen
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});