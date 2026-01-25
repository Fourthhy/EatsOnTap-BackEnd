require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 3000;

// 🟢 1. WRAP STARTUP
const startServer = async () => {
  try {
    // 🟢 2. CONNECT TO DB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    // 🟢 4. START SERVER
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            origin: [
                'http://localhost:5173',
                'https://eats-on-tap-front-end.vercel.app' 
            ],
            methods: ["GET", "POST"]
        }
    });

    app.set('socketio', io);

    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error('❌ Startup Error:', err);
    process.exit(1);
  }
};

startServer();