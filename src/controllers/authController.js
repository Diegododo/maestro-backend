const SpotifyWebApi = require('spotify-web-api-node');
const User = require('../models/User');

const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET, // Needed now for code exchange
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

exports.spotifyLogin = (req, res) => {
    const scopes = ['user-read-private', 'user-read-email', 'user-read-currently-playing', 'user-read-playback-state'];

    // Need to pass frontEnd URL as state to redirect correctly (simplified for now)
    // Third parameter 'true' enables show_dialog to force account selection on re-login
    const authorizeURL = spotifyApi.createAuthorizeURL(scopes, 'some-state-string', true);

    res.json({ url: authorizeURL });
};

exports.spotifyCallback = async (req, res) => {
    const code = req.query.code;

    try {
        // 1. Exchange auth code for access & refresh tokens
        const data = await spotifyApi.authorizationCodeGrant(code);
        const { access_token, refresh_token } = data.body;

        // 2. Determine who the user is using the new token
        spotifyApi.setAccessToken(access_token);
        const me = await spotifyApi.getMe();

        // 3. Save or update the user in DB
        const [user, created] = await User.findOrCreate({
            where: { spotifyId: me.body.id },
            defaults: {
                email: me.body.email,
                displayName: me.body.display_name || me.body.id,
                avatarUrl: me.body.images?.length ? me.body.images[0].url : null,
                accessToken: access_token,
                refreshToken: refresh_token,
            }
        });

        if (!created) {
            await user.update({ accessToken: access_token, refreshToken: refresh_token });
        }

        // 4. Return custom internal token or the user details 
        // Usually we redirect back to deep link:
        res.redirect(`musicsocialapp://feed?token=${user.id}`);

    } catch (error) {
        console.error('Error in Spotify Callback Auth:', error);
        res.status(500).send('Authentication Failed');
    }
};

exports.spotifyExchange = async (req, res) => {
    const { code, redirectUri } = req.body;

    if (!code || !redirectUri) {
        return res.status(400).json({ error: 'Code and redirectUri required' });
    }

    try {
        // Temporarily set the redirectUri on the spotifyApi instance to match what frontend sent
        const tempApi = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
            redirectUri: redirectUri,
        });

        // 1. Exchange auth code for access & refresh tokens
        const data = await tempApi.authorizationCodeGrant(code);
        const { access_token, refresh_token } = data.body;

        // 2. Determine who the user is using the new token
        tempApi.setAccessToken(access_token);
        const me = await tempApi.getMe();

        // 3. Save or update the user in DB
        const [user, created] = await User.findOrCreate({
            where: { spotifyId: me.body.id },
            defaults: {
                email: me.body.email,
                displayName: me.body.display_name || me.body.id,
                avatarUrl: me.body.images?.length ? me.body.images[0].url : null,
                accessToken: access_token,
                refreshToken: refresh_token,
            }
        });

        if (!created) {
            await user.update({
                accessToken: access_token,
                refreshToken: refresh_token,
                displayName: me.body.display_name || me.body.id,
                avatarUrl: me.body.images?.length ? me.body.images[0].url : null
            });
        }

        // Return the stable user.id as token
        res.json({ token: user.id });

    } catch (error) {
        console.dir(error, { depth: null });
        console.error('Error in Spotify Code Exchange DETAILS:', error.message);
        res.status(500).json({ error: 'Authentication Failed' });
    }
};
