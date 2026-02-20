const User = require('../models/User');
const Friend = require('../models/Friend');
const SpotifyWebApi = require('spotify-web-api-node');

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

        // Also include the user themselves so they see their own music
        friendIds.push(userId);

        // Get each person's user data (with Spotify tokens)
        const users = await User.findAll({
            where: { id: friendIds }
        });

        const activities = [];

        // Query Spotify directly for each user/friend
        for (const person of users) {
            if (!person.accessToken) continue;

            try {
                const spotifyApi = new SpotifyWebApi({
                    clientId: process.env.SPOTIFY_CLIENT_ID,
                    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
                });
                spotifyApi.setAccessToken(person.accessToken);

                const data = await spotifyApi.getMyCurrentPlayingTrack();

                if (data.body && data.body.is_playing && data.body.item) {
                    const track = data.body.item;
                    activities.push({
                        isPlaying: true,
                        id: person.id,
                        name: person.displayName,
                        avatar: person.avatarUrl,
                        track: track.name,
                        artist: track.artists.map(a => a.name).join(', '),
                        albumArt: track.album.images.length > 0 ? track.album.images[0].url : null,
                        spotifyUrl: track.external_urls?.spotify,
                        timestamp: Date.now()
                    });
                }
            } catch (spotifyErr) {
                console.log(`Widget: Could not fetch Spotify for ${person.displayName}: ${spotifyErr.message}`);
            }
        }

        res.json({ activities });
    } catch (error) {
        console.error('Error fetching widget activities:', error);
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
};

// Public endpoint — no auth needed, shows all users' music
exports.getAllActivities = async (req, res) => {
    try {
        const { Op } = require('sequelize');
        const allUsers = await User.findAll({
            where: { accessToken: { [Op.ne]: null } }
        });

        const activities = [];

        for (const person of allUsers) {
            try {
                const spotifyApi = new SpotifyWebApi({
                    clientId: process.env.SPOTIFY_CLIENT_ID,
                    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
                });
                spotifyApi.setAccessToken(person.accessToken);

                const data = await spotifyApi.getMyCurrentPlayingTrack();

                if (data.body && data.body.is_playing && data.body.item) {
                    const track = data.body.item;
                    activities.push({
                        isPlaying: true,
                        name: person.displayName,
                        avatar: person.avatarUrl,
                        track: track.name,
                        artist: track.artists.map(a => a.name).join(', '),
                        albumArt: track.album.images.length > 0 ? track.album.images[0].url : null,
                        spotifyUrl: track.external_urls?.spotify,
                        timestamp: Date.now()
                    });
                }
            } catch (spotifyErr) {
                console.log(`Widget: Could not fetch Spotify for ${person.displayName}: ${spotifyErr.message}`);
            }
        }

        res.json({ activities });
    } catch (error) {
        console.error('Error fetching all activities:', error);
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
};
