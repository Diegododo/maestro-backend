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

        // Get each friend's user data (with Spotify tokens)
        const friends = await User.findAll({
            where: { id: friendIds }
        });

        const activities = [];

        // Query Spotify directly for each friend
        for (const friend of friends) {
            if (!friend.accessToken) continue;

            try {
                const spotifyApi = new SpotifyWebApi({
                    clientId: process.env.SPOTIFY_CLIENT_ID,
                    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
                });
                spotifyApi.setAccessToken(friend.accessToken);

                const data = await spotifyApi.getMyCurrentPlayingTrack();

                if (data.body && data.body.is_playing && data.body.item) {
                    const track = data.body.item;
                    activities.push({
                        isPlaying: true,
                        id: friend.id,
                        name: friend.displayName,
                        avatar: friend.avatarUrl,
                        track: track.name,
                        artist: track.artists.map(a => a.name).join(', '),
                        albumArt: track.album.images.length > 0 ? track.album.images[0].url : null,
                        spotifyUrl: track.external_urls?.spotify,
                        timestamp: Date.now()
                    });
                }
            } catch (spotifyErr) {
                // Token expired or invalid — skip this friend silently
                console.log(`Widget: Could not fetch Spotify for ${friend.displayName}: ${spotifyErr.message}`);
            }
        }

        res.json({ activities });
    } catch (error) {
        console.error('Error fetching widget activities:', error);
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
};
