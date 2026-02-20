const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const { initPG, initRedis } = require('./src/config/db');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || '*',
        methods: ["GET", "POST"]
    }
});

// Middlewares
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Backend is running' });
});

// Diagnostic endpoint (check env vars without revealing secrets)
app.get('/health/env', (req, res) => {
    res.json({
        SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID ? '✅ SET' : '❌ MISSING',
        SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET ? '✅ SET' : '❌ MISSING',
        SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI || '❌ MISSING',
        DATABASE_URL: process.env.DATABASE_URL ? '✅ SET' : '❌ MISSING',
        NODE_ENV: process.env.NODE_ENV || 'not set',
    });
});

// Import specific routes
const authRoutes = require('./src/routes/auth');
const spotifyRoutes = require('./src/routes/spotify');
const friendsRoutes = require('./src/routes/friends');
const usersRoutes = require('./src/routes/users');
const widgetRoutes = require('./src/routes/widget');

app.use('/api/auth', authRoutes);
app.use('/api/spotify', spotifyRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/widget', widgetRoutes);

// --- Import Realtime Polling Service ---
const { initSpotifyPolling } = require('./src/services/spotifyService');

// Initialize the Spotify polling service via Socket.io
initSpotifyPolling(io);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    // Await database initialization
    await initPG();
    await initRedis();
    console.log(`Server is running on port ${PORT}`);
});
