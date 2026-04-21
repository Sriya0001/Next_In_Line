const { query } = require('../config/db');

/**
 * GET /api/pipeline/:jobId
 * Full pipeline snapshot: active + waitlist + summary stats.
 */
async function getPipelineSnapshot(req, res) {
  const { jobId } = req.params;

  const jobRes = await query('SELECT * FROM jobs WHERE id = $1', [jobId]);
  if (!jobRes.rows.length) {
    return res.status(404).json({ error: { message: 'Job not found' } });
  }
  const job = jobRes.rows[0];

  const [activeRes, waitlistRes, statsRes] = await Promise.all([
    query(
      `SELECT a.*, ap.name, ap.email,
              CASE WHEN a.acknowledge_deadline < NOW() THEN true ELSE false END AS is_overdue,
              GREATEST(0, EXTRACT(EPOCH FROM (a.acknowledge_deadline - NOW())) * 1000) AS time_remaining_ms
       FROM applications a
       JOIN applicants ap ON ap.id = a.applicant_id
       WHERE a.job_id = $1 AND a.status = ANY(ARRAY['active','acknowledged']::application_status[])
       ORDER BY a.promoted_at ASC NULLS LAST`,
      [jobId]
    ),
    query(
      `SELECT a.*, ap.name, ap.email
       FROM applications a
       JOIN applicants ap ON ap.id = a.applicant_id
       WHERE a.job_id = $1 AND a.status = 'waitlisted'
       ORDER BY a.waitlist_position ASC`,
      [jobId]
    ),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status = ANY(ARRAY['active','acknowledged']::application_status[])) AS active_count,
         COUNT(*) FILTER (WHERE status = 'waitlisted') AS waitlist_count,
         COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
         COUNT(*) FILTER (WHERE status = 'withdrawn') AS withdrawn_count,
         COUNT(*) FILTER (WHERE decay_penalty_count > 0) AS decayed_count,
         COUNT(*) AS total_count,
         SUM(decay_penalty_count) AS total_decays
       FROM applications WHERE job_id = $1`,
      [jobId]
    ),
  ]);

  return res.json({
    data: {
      job,
      active: activeRes.rows,
      waitlist: waitlistRes.rows,
      stats: statsRes.rows[0],
      capacity_used: parseInt(statsRes.rows[0].active_count, 10),
      capacity_total: job.active_capacity,
      capacity_available: job.active_capacity - parseInt(statsRes.rows[0].active_count, 10),
    },
  });
}

/**
 * GET /api/pipeline/:jobId/events
 * Full audit log for a job, paginated.
 */
async function getJobEvents(req, res) {
  const { jobId } = req.params;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
  const offset = (page - 1) * limit;

  const jobCheck = await query('SELECT id FROM jobs WHERE id = $1', [jobId]);
  if (!jobCheck.rows.length) {
    return res.status(404).json({ error: { message: 'Job not found' } });
  }

  const [eventsRes, countRes] = await Promise.all([
    query(
      `SELECT pe.*, ap.name AS applicant_name, ap.email AS applicant_email
       FROM pipeline_events pe
       LEFT JOIN applicants ap ON ap.id = pe.applicant_id
       WHERE pe.job_id = $1
       ORDER BY pe.created_at DESC
       LIMIT $2 OFFSET $3`,
      [jobId, limit, offset]
    ),
    query('SELECT COUNT(*) AS total FROM pipeline_events WHERE job_id = $1', [jobId]),
  ]);

  const total = parseInt(countRes.rows[0].total, 10);

  return res.json({
    data: eventsRes.rows,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
      has_next: offset + limit < total,
    },
  });
}

module.exports = { getPipelineSnapshot, getJobEvents };
