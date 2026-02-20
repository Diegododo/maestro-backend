const SpotifyWebApi = require('spotify-web-api-node');

exports.getNowPlaying = async (req, res) => {
    try {
        // Normally, the access token would come from the user's session in the DB through a middleware
        const accessToken = req.headers.authorization?.split(' ')[1];

        if (!accessToken) {
            return res.status(401).json({ error: 'No access token provided' });
        }

        const spotifyApi = new SpotifyWebApi();
        spotifyApi.setAccessToken(accessToken);

        const data = await spotifyApi.getMyCurrentPlayingTrack();

        if (data.body && data.body.is_playing) {
            const track = data.body.item;
            res.json({
                isPlaying: true,
                title: track.name,
                artist: track.artists.map(a => a.name).join(', '),
                albumArt: track.album.images.length > 0 ? track.album.images[0].url : null,
            });
        } else {
            res.json({ isPlaying: false, message: 'User is not playing anything.' });
        }

    } catch (error) {
        console.error('Error fetching Now Playing:', error);
        res.status(500).json({ error: 'Failed to fetch currently playing track.' });
    }
};
