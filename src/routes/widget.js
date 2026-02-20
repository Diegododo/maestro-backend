const express = require('express');
const router = express.Router();
const widgetController = require('../controllers/widgetController');

// Get activities for widget display (requires auth)
router.get('/activities', widgetController.getWidgetActivities);

// Public: get ALL users' activities (no auth needed — for small friend groups)
router.get('/all', widgetController.getAllActivities);

module.exports = router;
