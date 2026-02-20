const express = require('express');
const router = express.Router();
const spotifyController = require('../controllers/spotifyController');

// Spotify related routes requiring valid access token
router.get('/now-playing', spotifyController.getNowPlaying);

module.exports = router;
