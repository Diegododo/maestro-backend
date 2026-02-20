const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Spotify authentication routes
router.get('/spotify', authController.spotifyLogin);
router.get('/spotify/callback', authController.spotifyCallback);
router.post('/spotify/exchange', authController.spotifyExchange);

module.exports = router;
