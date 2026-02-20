const cron = require('node-cron');
const SpotifyWebApi = require('spotify-web-api-node');
const { getRedisClient } = require('../config/db');
const User = require('../models/User');

// In-memory stores
const activeUsers = new Map();
const nowPlayingCache = new Map(); // Fallback when Redis is unavailable

// Helper: get/set cache (Redis or in-memory)
async function getCached(key) {
    const redisClient = getRedisClient();
    if (redisClient) {
        try {
            return await redisClient.get(key);
        } catch (e) { /* fall through to memory */ }
    }
    return nowPlayingCache.get(key) || null;
}

async function setCached(key, value, ttlSeconds) {
    const redisClient = getRedisClient();
    if (redisClient) {
        try {
            await redisClient.setEx(key, ttlSeconds, value);
        } catch (e) { /* fall through to memory */ }
    }
    nowPlayingCache.set(key, value);
    // Auto-expire from memory
    setTimeout(() => nowPlayingCache.delete(key), ttlSeconds * 1000);
}

async function getAllCachedKeys() {
    const redisClient = getRedisClient();
    if (redisClient) {
        try {
            return await redisClient.keys('now_playing:*');
        } catch (e) { /* fall through */ }
    }
    return Array.from(nowPlayingCache.keys()).filter(k => k.startsWith('now_playing:'));
}

const initSpotifyPolling = (io) => {
    io.on('connection', async (socket) => {
        const userId = socket.handshake.auth.token;

        if (userId) {
            console.log(`User ${userId} active on socket ${socket.id}`);
            activeUsers.set(userId, socket.id);

            // Fetch friends
            const Friend = require('../models/Friend');
            let friendIds = [];
            try {
                const friendsRecords = await Friend.findAll({
                    where: { userId: userId, status: 'accepted' },
                    attributes: ['friendId']
                });
                friendIds = friendsRecords.map(f => f.friendId.toString());
                friendIds.push(userId.toString());
            } catch (err) {
                console.error("Error fetching friends for initial state", err);
            }

            // Send cached states to new user
            try {
                const keys = await getAllCachedKeys();
                for (const key of keys) {
                    const authorId = key.replace('now_playing:', '');
                    if (friendIds.includes(authorId)) {
                        const dataStr = await getCached(key);
                        if (dataStr) {
                            const activity = JSON.parse(dataStr);
                            if (activity.isPlaying) {
                                socket.emit('friends_activity_update', activity);
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Error fetching initial state", err);
            }

            socket.on('disconnect', () => {
                console.log(`User ${userId} disconnected`);
                activeUsers.delete(userId);
            });
        }
    });

    // Cron job every 5 seconds
    cron.schedule('*/5 * * * * *', async () => {
        if (activeUsers.size === 0) return;

        const { Op } = require('sequelize');

        const usersToPoll = await User.findAll({
            where: { accessToken: { [Op.ne]: null } }
        });

        for (const user of usersToPoll) {
            const userId = user.id.toString();

            try {
                const spotifyApi = new SpotifyWebApi({
                    clientId: process.env.SPOTIFY_CLIENT_ID,
                    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
                });
                spotifyApi.setAccessToken(user.accessToken);

                const data = await spotifyApi.getMyCurrentPlayingTrack();

                let currentActivity = { isPlaying: false, id: userId, name: user.displayName };

                if (data.body && data.body.is_playing && data.body.item) {
                    const track = data.body.item;
                    currentActivity = {
                        isPlaying: true,
                        id: userId,
                        name: user.displayName,
                        avatar: user.avatarUrl,
                        track: track.name,
                        artist: track.artists.map(a => a.name).join(', '),
                        albumArt: track.album.images.length > 0 ? track.album.images[0].url : null,
                        spotifyUri: track.uri,
                        spotifyUrl: track.external_urls?.spotify,
                        timestamp: Date.now()
                    };
                }

                // Check cache for changes
                const redisKey = `now_playing:${userId}`;
                const previousStateStr = await getCached(redisKey);

                let hasChanged = true;
                if (previousStateStr) {
                    const previousState = JSON.parse(previousStateStr);
                    if (previousState.isPlaying === currentActivity.isPlaying &&
                        previousState.track === currentActivity.track &&
                        previousState.name === currentActivity.name &&
                        previousState.avatar === currentActivity.avatar) {
                        hasChanged = false;
                    }
                }

                if (hasChanged) {
                    await setCached(redisKey, JSON.stringify(currentActivity), 180);

                    const Friend = require('../models/Friend');
                    const friendsRecords = await Friend.findAll({
                        where: { userId: userId, status: 'accepted' },
                        attributes: ['friendId']
                    });
                    const friendIds = friendsRecords.map(f => f.friendId);
                    friendIds.push(userId);

                    for (const fId of friendIds) {
                        const friendSocketId = activeUsers.get(fId);
                        if (friendSocketId) {
                            io.to(friendSocketId).emit('friends_activity_update', currentActivity);
                        }
                    }
                }

            } catch (error) {
                console.log(`Error polling for user ${userId}:`, error.message);
            }
        }
    });
};

module.exports = { initSpotifyPolling };
