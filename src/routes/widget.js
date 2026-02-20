const express = require('express');
const router = express.Router();
const widgetController = require('../controllers/widgetController');

// Get activities for widget display
router.get('/activities', widgetController.getWidgetActivities);

module.exports = router;
