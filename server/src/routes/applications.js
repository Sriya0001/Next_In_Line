const router = require('express').Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { getApplication, acknowledge, exit, getApplicationEvents } = require('../controllers/applicationController');

router.get('/:id', asyncHandler(getApplication));
router.post('/:id/acknowledge', asyncHandler(acknowledge));
router.patch('/:id/exit', asyncHandler(exit));
router.get('/:id/events', asyncHandler(getApplicationEvents));

module.exports = router;
