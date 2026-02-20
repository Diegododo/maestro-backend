const User = require('../models/User');
const Friend = require('../models/Friend');
const { getRedisClient } = require('../config/db');

exports.getWidgetActivities = async (req, res) => {
    const userId = req.headers.authorization;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Fetch friends
        const friendsRecords = await Friend.findAll({
            where: { userId: userId, status: 'accepted' },
            attributes: ['friendId']
        });

        const friendIds = friendsRecords.map(f => f.friendId.toString());

        // Get activities from Redis
        const redisClient = getRedisClient();
        const activities = [];

        if (redisClient) {
            for (const fId of friendIds) {
                try {
                    const dataStr = await redisClient.get(`now_playing:${fId}`);
                    if (dataStr) {
                        const activity = JSON.parse(dataStr);
                        if (activity.isPlaying) {
                            activities.push(activity);
                        }
                    }
                } catch (err) {
                    console.error(`Error reading Redis for ${fId}:`, err);
                }
            }
        }

        // Sort by most recent first
        activities.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        res.json({ activities });
    } catch (error) {
        console.error('Error fetching widget activities:', error);
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
};
