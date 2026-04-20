const router = require('express').Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { seedData, triggerDecay, getStats } = require('../controllers/adminController');
const { listNotifications, notificationStats } = require('../controllers/notificationController');

router.post('/seed', asyncHandler(seedData));
router.post('/trigger-decay', asyncHandler(triggerDecay));
router.get('/stats', asyncHandler(getStats));

// ─── Notification log ──────────────────────────────────────────
router.get('/notifications', asyncHandler(listNotifications));
router.get('/notifications/stats', asyncHandler(notificationStats));

module.exports = router;
