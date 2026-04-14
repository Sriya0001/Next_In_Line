const router = require('express').Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { getPipelineSnapshot, getJobEvents } = require('../controllers/pipelineController');
const validateUUID = require('../middleware/validateUUID');

router.get('/:jobId', validateUUID('jobId'), asyncHandler(getPipelineSnapshot));
router.get('/:jobId/events', validateUUID('jobId'), asyncHandler(getJobEvents));

module.exports = router;
