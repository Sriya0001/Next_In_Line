const router = require('express').Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { getApplication, acknowledge, exit, getApplicationEvents, lookupApplications } = require('../controllers/applicationController');
const validateUUID = require('../middleware/validateUUID');

router.post('/lookup', asyncHandler(lookupApplications));
router.get('/:id', validateUUID('id'), asyncHandler(getApplication));
router.post('/:id/acknowledge', validateUUID('id'), asyncHandler(acknowledge));
router.patch('/:id/exit', validateUUID('id'), asyncHandler(exit));
router.get('/:id/events', validateUUID('id'), asyncHandler(getApplicationEvents));

module.exports = router;
