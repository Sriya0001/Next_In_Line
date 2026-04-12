const router = require('express').Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { getPipelineSnapshot, getJobEvents } = require('../controllers/pipelineController');

router.get('/:jobId', asyncHandler(getPipelineSnapshot));
router.get('/:jobId/events', asyncHandler(getJobEvents));

module.exports = router;
