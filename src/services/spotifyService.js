const cron = require('node-cron');
const SpotifyWebApi = require('spotify-web-api-node');
const { getRedisClient } = require('../config/db');
const User = require('../models/User');

// In-memory store for active socket connections
// Map<userId, socketId>
const activeUsers = new Map();

const initSpotifyPolling = (io) => {
    // 1. Listen for active socket connections
    io.on('connection', async (socket) => {
        const userId = socket.handshake.auth.token; // In MVP, we passed userId as token directly

        if (userId) {
            console.log(`User ${userId} active on socket ${socket.id}`);
            activeUsers.set(userId, socket.id);

            // Fetch friends of the connecting user
            const Friend = require('../models/Friend');
            let friendIds = [];
            try {
                const friendsRecords = await Friend.findAll({
                    where: { userId: userId, status: 'accepted' },
                    attributes: ['friendId']
                });
                friendIds = friendsRecords.map(f => f.friendId.toString());
                friendIds.push(userId.toString()); // Also include themselves
            } catch (err) {
                console.error("Error fetching friends for initial state", err);
            }

            // Fetch and send current known states from Redis to this new user!
            const redisClient = getRedisClient();
            try {
                const keys = await redisClient.keys('now_playing:*');
                for (const key of keys) {
                    const authorId = key.replace('now_playing:', '');
                    // Only send data if the author is a friend (or the user themselves)
                    if (friendIds.includes(authorId)) {
                        const dataStr = await redisClient.get(key);
                        if (dataStr) {
                            const activity = JSON.parse(dataStr);
                            if (activity.isPlaying) {
                                console.log(`[DEBUG] [INIT] Sending ${authorId}'s activity to user ${userId}`);
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

    // 2. Cron job running every 5 seconds
    cron.schedule('*/5 * * * * *', async () => {
        if (activeUsers.size === 0) return;

        const redisClient = getRedisClient();
        const { Op } = require('sequelize');

        // Poll ALL users who have connected their Spotify account (so the feed works even if app is in background)
        // This ensures that when User A opens the app, they see User B's music even if User B's app is closed.
        const usersToPoll = await User.findAll({
            where: {
                accessToken: { [Op.ne]: null }
            }
        });

        for (const user of usersToPoll) {
            const userId = user.id.toString();

            try {
                // Initialize Spotify API
                const spotifyApi = new SpotifyWebApi({
                    clientId: process.env.SPOTIFY_CLIENT_ID,
                    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
                });
                spotifyApi.setAccessToken(user.accessToken);

                // Re-fetch the user details from Spotify to force a name / avatar update in the background if it changed!
                try {
                    const me = await spotifyApi.getMe();
                    const newDisplayName = me.body.display_name || me.body.id;
                    const newAvatarUrl = me.body.images?.length ? me.body.images[0].url : null;

                    if (user.displayName !== newDisplayName || user.avatarUrl !== newAvatarUrl) {
                        await user.update({
                            displayName: newDisplayName,
                            avatarUrl: newAvatarUrl
                        });
                        console.log(`Updated profile for ${userId} in background`);
                    }
                } catch (e) {
                    console.error("Failed to fetch fresh profile data in background", e.message);
                }

                // Note: We skip refresh token logic here for the MVP simplicity.
                // In production, we must catch 401s and use refreshToken to get a new access token.

                // Get What they are playing
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

                // Check Redis for previous state
                const redisKey = `now_playing:${userId}`;
                const previousStateStr = await redisClient.get(redisKey);

                let hasChanged = true;
                if (previousStateStr) {
                    const previousState = JSON.parse(previousStateStr);
                    // Compare track name to see if it changed
                    // ALSO compare profile info (name, avatar) so UI updates instantly when testing profile changes
                    if (previousState.isPlaying === currentActivity.isPlaying &&
                        previousState.track === currentActivity.track &&
                        previousState.name === currentActivity.name &&
                        previousState.avatar === currentActivity.avatar) {
                        hasChanged = false;
                    }
                }

                if (hasChanged) {
                    console.log(`[DEBUG] Activity changed for ${user.displayName}: ${currentActivity.isPlaying ? currentActivity.track : 'Paused'}`);

                    // Update Redis (Expire after 3 minutes)
                    await redisClient.setEx(redisKey, 180, JSON.stringify(currentActivity));

                    // Fetch friends of this user
                    const Friend = require('../models/Friend');
                    const friendsRecords = await Friend.findAll({
                        where: { userId: userId, status: 'accepted' },
                        attributes: ['friendId']
                    });
                    const friendIds = friendsRecords.map(f => f.friendId);

                    // Broadcast ONLY to active friends (and the user themselves if needed)
                    // Ensure the acting user gets their own update to see their own feed if desired
                    friendIds.push(userId);

                    console.log(`[DEBUG] Broadcasting ${user.displayName}'s activity to user IDs:`, friendIds);
                    console.log(`[DEBUG] Currently active sockets:`, Array.from(activeUsers.keys()));

                    for (const fId of friendIds) {
                        const friendSocketId = activeUsers.get(fId);
                        if (friendSocketId) {
                            console.log(`[DEBUG] -> Sending to active user ${fId} on socket ${friendSocketId}`);
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
