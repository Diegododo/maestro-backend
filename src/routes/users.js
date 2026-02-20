const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Search users (existing MVP route)
router.get('/search', userController.searchUsers);

// Save push token (existing MVP route)
router.post('/push-token', userController.savePushToken);

// Get current user profile (Me)
router.get('/me', userController.getMe);

module.exports = router;
