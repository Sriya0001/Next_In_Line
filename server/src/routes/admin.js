const router = require('express').Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { seedData, triggerDecay, getStats } = require('../controllers/adminController');

router.post('/seed', asyncHandler(seedData));
router.post('/trigger-decay', asyncHandler(triggerDecay));
router.get('/stats', asyncHandler(getStats));

module.exports = router;
