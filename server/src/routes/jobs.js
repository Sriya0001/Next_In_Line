const router = require('express').Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { createJob, listJobs, getJob, changeCapacity, updateJobStatus } = require('../controllers/jobController');
const { apply } = require('../controllers/applicationController');
const { applyLimiter } = require('../middleware/rateLimiter');

router.post('/', asyncHandler(createJob));
router.get('/', asyncHandler(listJobs));
router.get('/:id', asyncHandler(getJob));
router.patch('/:id/capacity', asyncHandler(changeCapacity));
router.patch('/:id/status', asyncHandler(updateJobStatus));

// Apply to a job — uses strict rate limiter
router.post('/:jobId/apply', applyLimiter, asyncHandler(apply));

module.exports = router;
