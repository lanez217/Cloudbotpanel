require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { startBot, stopBot } = require('./bot.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files directly from project root
app.use(express.static(__dirname));
app.use(express.json());

let activeBots = new Map();

// Serve dashboard HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Live Stats API for dashboard ping & user counts
app.get('/api/stats', (req, res) => {
    res.json({
        botsOnline: activeBots.size,
        totalUsers: activeBots.size,
        uptime: process.uptime()
    });
});

// Real-time WebSockets setup
io.on('connection', (socket) => {
    console.log('User connected to panel');

    socket.on('connect_bot', async ({ userId, phone }) => {
        if (activeBots.has(userId)) {
            return socket.emit('status', 'Bot instance already running');
        }

        socket.emit('status', 'Starting bot...');
        try {
            const sock = await startBot(userId, phone, io, socket);
            activeBots.set(userId, sock);
        } catch (err) {
            console.error('Error starting bot:', err);
            socket.emit('status', 'Failed to start bot instance.');
        }
    });

    socket.on('disconnect_bot', ({ userId }) => {
        if (activeBots.has(userId)) {
            stopBot(userId);
            activeBots.delete(userId);
            socket.emit('disconnected');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`⚡ CloudBot Panel running on port ${PORT}`);
});
