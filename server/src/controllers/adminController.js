const { query } = require('../config/db');
const { triggerDecayCycle } = require('../scheduler/decayScheduler');

/**
 * POST /api/admin/seed
 * Runs the seed script inline (dev only).
 */
async function seedData(req, res) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: { message: 'Seeding not allowed in production' } });
  }
  // Dynamically require to avoid loading seed logic at startup
  try {
    // We can't run the seed script fully inline (it calls pool.end()),
    // so we return instructions instead
    return res.json({
      message: 'Run `npm run seed` in the server directory to seed data',
    });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
}

/**
 * POST /api/admin/trigger-decay
 * Manually trigger the decay scheduler cycle (dev/testing only).
 */
async function triggerDecay(req, res) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: { message: 'Not allowed in production' } });
  }
  await triggerDecayCycle();
  return res.json({ message: 'Decay cycle triggered' });
}

/**
 * GET /api/admin/stats
 * System-wide stats.
 */
async function getStats(req, res) {
  const result = await query(
    `SELECT
       (SELECT COUNT(*) FROM jobs) AS total_jobs,
       (SELECT COUNT(*) FROM jobs WHERE status = 'open') AS open_jobs,
       (SELECT COUNT(*) FROM applicants) AS total_applicants,
       (SELECT COUNT(*) FROM applications) AS total_applications,
       (SELECT COUNT(*) FROM applications WHERE status = ANY(ARRAY['active','acknowledged']::application_status[])) AS active_applications,
       (SELECT COUNT(*) FROM applications WHERE status = 'waitlisted') AS waitlisted_applications,
       (SELECT COUNT(*) FROM pipeline_events) AS total_events`,
    []
  );
  return res.json({ data: result.rows[0] });
}

module.exports = { seedData, triggerDecay, getStats };
