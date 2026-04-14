const router = require('express').Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { createJob, listJobs, getJob, changeCapacity, updateJobStatus } = require('../controllers/jobController');
const { apply } = require('../controllers/applicationController');
const { applyLimiter } = require('../middleware/rateLimiter');
const validateUUID = require('../middleware/validateUUID');

router.post('/', asyncHandler(createJob));
router.get('/', asyncHandler(listJobs));
router.get('/:id', validateUUID('id'), asyncHandler(getJob));
router.patch('/:id/capacity', validateUUID('id'), asyncHandler(changeCapacity));
router.patch('/:id/status', validateUUID('id'), asyncHandler(updateJobStatus));

// Apply to a job — uses strict rate limiter
router.post('/:jobId/apply', validateUUID('jobId'), applyLimiter, asyncHandler(apply));

module.exports = router;
