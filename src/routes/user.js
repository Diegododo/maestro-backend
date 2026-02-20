const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Récupérer le profil courant
router.get('/me', async (req, res) => {
    try {
        const userId = req.user.id; // assumant que authMiddleware ajoute req.user
        const user = await User.findByPk(userId, {
            attributes: ['id', 'displayName', 'avatarUrl', 'email']
        });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error('Error fetching /me:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
