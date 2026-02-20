const { Op } = require('sequelize');
const User = require('../models/User');

exports.searchUsers = async (req, res) => {
    const { q } = req.query;
    const userId = req.headers.authorization; // Using the MVP token mechanism

    try {
        if (!q || q.length < 2) {
            return res.json({ users: [] });
        }

        const users = await User.findAll({
            where: {
                displayName: {
                    [Op.iLike]: `%${q}%`
                }
            },
            attributes: ['id', 'displayName', 'avatarUrl'], // Exclude sensitive info
            limit: 10
        });

        // Filter out the current user if userId is provided
        const filteredUsers = userId ? users.filter(u => u.id !== userId) : users;

        res.json({ users: filteredUsers });
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ error: 'Failed to search users' });
    }
};

exports.savePushToken = async (req, res) => {
    const { pushToken } = req.body;
    const userId = req.headers.authorization; // Using the MVP token mechanism

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const user = await User.findByPk(userId);
        if (user) {
            user.pushToken = pushToken;
            await user.save();
            return res.status(200).json({ message: 'Push token saved successfully' });
        } else {
            return res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Error saving push token:', error);
        res.status(500).json({ error: 'Failed to save push token' });
    }
};

exports.getMe = async (req, res) => {
    const userId = req.headers.authorization; // Using the MVP token mechanism

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const user = await User.findByPk(userId, {
            attributes: ['id', 'displayName', 'avatarUrl', 'email'] // Returns basic profile info
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error('Error fetching /me:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
};
