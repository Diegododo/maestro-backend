const express = require('express');
const router = express.Router();
const friendsController = require('../controllers/friendsController');

// Middleware to mock authentication extraction from token (to be improved later)
// For now, it assumes req.headers.authorization contains the user ID
const mockAuthMiddleware = (req, res, next) => {
    const userId = req.headers.authorization;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized, no ID provided in authorization header' });
    }
    req.userId = userId;
    next();
};

router.use(mockAuthMiddleware);

router.get('/', friendsController.getFriendsAndRequests);
router.post('/request', friendsController.sendFriendRequest);
router.post('/accept', friendsController.acceptFriendRequest);
router.delete('/remove/:friendId', friendsController.removeFriend);

module.exports = router;
