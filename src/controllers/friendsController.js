const User = require('../models/User');
const Friend = require('../models/Friend');
const { Op } = require('sequelize');

let Expo;
let expo;
const getExpo = async () => {
    if (!expo && !Expo) {
        const expoModule = await import('expo-server-sdk');
        Expo = expoModule.Expo;
        expo = new Expo();
    }
    return { Expo, expo };
};

exports.sendFriendRequest = async (req, res) => {
    const { friendId } = req.body;
    const userId = req.userId;

    if (friendId === userId) {
        return res.status(400).json({ error: "You cannot add yourself." });
    }

    try {
        const friendUser = await User.findByPk(friendId);
        if (!friendUser) {
            return res.status(404).json({ error: "User not found." });
        }

        // 1. Check if we already sent an outgoing request
        const existingOutgoing = await Friend.findOne({
            where: {
                userId: userId,
                friendId: friendId
            }
        });

        if (existingOutgoing) {
            return res.status(400).json({ error: "Request already sent or users are already friends." });
        }

        // 2. Check if the OTHER user already sent us a request!
        const existingIncoming = await Friend.findOne({
            where: {
                userId: friendId,
                friendId: userId,
                status: 'pending'
            }
        });

        if (existingIncoming) {
            // Auto accept their request to avoid duplicates
            await existingIncoming.update({ status: 'accepted' });
            await Friend.create({
                userId: userId,
                friendId: friendId,
                status: 'accepted'
            });
            return res.status(200).json({ message: "Auto-accepted: They already sent you a request." });
        }

        const currentUser = await User.findByPk(userId);

        await Friend.create({
            userId: userId,
            friendId: friendId,
            status: 'pending'
        });

        // Send Push Notification
        if (friendUser.pushToken) {
            const { Expo, expo } = await getExpo();
            if (Expo.isExpoPushToken(friendUser.pushToken)) {
                const messages = [{
                    to: friendUser.pushToken,
                    sound: 'default',
                    title: 'Nouvelle demande d\'ami',
                    body: `${currentUser.displayName} vous a envoyé une demande d'ami.`,
                    data: { friendId: userId },
                }];

                try {
                    let chunks = expo.chunkPushNotifications(messages);
                    for (let chunk of chunks) {
                        await expo.sendPushNotificationsAsync(chunk);
                    }
                } catch (expoError) {
                    console.error('Error sending push notification:', expoError);
                }
            }
        }

        res.status(201).json({ message: "Friend request sent successfully." });

    } catch (error) {
        console.error("Error sending friend request:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.acceptFriendRequest = async (req, res) => {
    const { friendId } = req.body; // friendId is the user who SENT the request
    const userId = req.userId; // the current user accepting the request

    try {
        const request = await Friend.findOne({
            where: {
                userId: friendId,
                friendId: userId,
                status: 'pending'
            }
        });

        if (!request) {
            return res.status(404).json({ error: "Friend request not found." });
        }

        // Update the request to accepted
        await request.update({ status: 'accepted' });

        // Add or update the reciprocal relationship so both users see each other as friends
        const [reciprocal, created] = await Friend.findOrCreate({
            where: {
                userId: userId,
                friendId: friendId
            },
            defaults: {
                status: 'accepted'
            }
        });

        if (!created && reciprocal.status !== 'accepted') {
            await reciprocal.update({ status: 'accepted' });
        }

        res.json({ message: "Friend request accepted." });

    } catch (error) {
        console.error("Error accepting friend request:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.getFriendsAndRequests = async (req, res) => {
    const userId = req.userId;

    try {
        // Find accepted friends
        const acceptedFriendsRecords = await Friend.findAll({
            where: { userId: userId, status: 'accepted' },
            attributes: ['friendId']
        });

        const friendIds = acceptedFriendsRecords.map(record => record.friendId);

        const friends = await User.findAll({
            where: { id: { [Op.in]: friendIds } },
            attributes: ['id', 'displayName', 'avatarUrl', 'spotifyId']
        });

        // Find incoming pending requests
        const pendingRequestRecords = await Friend.findAll({
            where: { friendId: userId, status: 'pending' },
            attributes: ['userId']
        });

        const requesterIds = pendingRequestRecords.map(record => record.userId);

        const pendingRequests = await User.findAll({
            where: { id: { [Op.in]: requesterIds } },
            attributes: ['id', 'displayName', 'avatarUrl']
        });

        res.json({
            friends,
            pendingRequests
        });

    } catch (error) {
        console.error("Error fetching friends:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.removeFriend = async (req, res) => {
    const { friendId } = req.params;
    const userId = req.userId;

    try {
        // Delete the relationship where current user is the source
        const deleteCount1 = await Friend.destroy({
            where: {
                userId: userId,
                friendId: friendId
            }
        });

        // Delete the reciprocal relationship where current user is the target
        const deleteCount2 = await Friend.destroy({
            where: {
                userId: friendId,
                friendId: userId
            }
        });

        if (deleteCount1 === 0 && deleteCount2 === 0) {
            return res.status(404).json({ error: "Friend or request not found." });
        }

        res.json({ message: "Friend or request removed successfully." });

    } catch (error) {
        console.error("Error removing friend:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
