const { query } = require('../config/db');
const { updateCapacity, applyToJob, logEvent } = require('../services/pipelineEngine');
const { getClient } = require('../config/db');

/**
 * POST /api/jobs
 * Create a new job opening.
 */
async function createJob(req, res) {
  const { title, description, company_name, active_capacity, decay_window_hours } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: { message: 'title is required' } });
  }
  if (!company_name || typeof company_name !== 'string' || !company_name.trim()) {
    return res.status(400).json({ error: { message: 'company_name is required' } });
  }
  if (!active_capacity || !Number.isInteger(active_capacity) || active_capacity < 1) {
    return res.status(400).json({ error: { message: 'active_capacity must be a positive integer' } });
  }
  const decayHours = decay_window_hours ?? 24;
  if (!Number.isInteger(decayHours) || decayHours < 1) {
    return res.status(400).json({ error: { message: 'decay_window_hours must be a positive integer' } });
  }

  const result = await query(
    `INSERT INTO jobs (title, description, company_name, active_capacity, decay_window_hours)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [title.trim(), description?.trim() || null, company_name.trim(), active_capacity, decayHours]
  );

  return res.status(201).json({ data: result.rows[0] });
}

/**
 * GET /api/jobs
 * List all jobs with summary counts.
 */
async function listJobs(req, res) {
  const result = await query(
    `SELECT j.*,
            COUNT(a.id) FILTER (WHERE a.status = ANY(ARRAY['active','acknowledged']::application_status[])) AS active_count,
            COUNT(a.id) FILTER (WHERE a.status = 'waitlisted') AS waitlist_count,
            COUNT(a.id) FILTER (WHERE a.status = ANY(ARRAY['rejected','withdrawn']::application_status[])) AS exited_count
     FROM jobs j
     LEFT JOIN applications a ON a.job_id = j.id
     GROUP BY j.id
     ORDER BY j.created_at DESC`,
    []
  );
  return res.json({ data: result.rows });
}

/**
 * GET /api/jobs/:id
 * Get a single job with full pipeline state.
 */
async function getJob(req, res) {
  const { id } = req.params;

  const jobRes = await query('SELECT * FROM jobs WHERE id = $1', [id]);
  if (!jobRes.rows.length) {
    return res.status(404).json({ error: { message: 'Job not found' } });
  }

  const activeRes = await query(
    `SELECT a.*, ap.name, ap.email
     FROM applications a
     JOIN applicants ap ON ap.id = a.applicant_id
     WHERE a.job_id = $1 AND a.status = ANY(ARRAY['active','acknowledged']::application_status[])
     ORDER BY a.promoted_at ASC NULLS LAST`,
    [id]
  );

  const waitlistRes = await query(
    `SELECT a.*, ap.name, ap.email
     FROM applications a
     JOIN applicants ap ON ap.id = a.applicant_id
     WHERE a.job_id = $1 AND a.status = 'waitlisted'
     ORDER BY a.waitlist_position ASC`,
    [id]
  );

  return res.json({
    data: {
      job: jobRes.rows[0],
      active: activeRes.rows,
      waitlist: waitlistRes.rows,
    },
  });
}

/**
 * PATCH /api/jobs/:id/capacity
 * Update the active capacity of a job.
 */
async function changeCapacity(req, res) {
  const { id } = req.params;
  const { active_capacity } = req.body;

  if (!Number.isInteger(active_capacity) || active_capacity < 1) {
    return res.status(400).json({ error: { message: 'active_capacity must be a positive integer' } });
  }

  const result = await updateCapacity(id, active_capacity);
  return res.json({ data: result, message: 'Capacity updated and pipeline adjusted' });
}

/**
 * PATCH /api/jobs/:id/status
 * Open, pause, or close a job.
 */
async function updateJobStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  if (!['open', 'paused', 'closed'].includes(status)) {
    return res.status(400).json({ error: { message: "status must be 'open', 'paused', or 'closed'" } });
  }

  const result = await withTransaction(async (client) => {
    const checkRes = await client.query('SELECT status FROM jobs WHERE id = $1 FOR UPDATE', [id]);
    if (!checkRes.rows.length) {
      throw Object.assign(new Error('Job not found'), { statusCode: 404 });
    }
    const oldStatus = checkRes.rows[0].status;

    const updateRes = await client.query(
      'UPDATE jobs SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    await logEvent(client, {
      jobId: id,
      eventType: 'job_status_changed',
      fromStatus: oldStatus,
      toStatus: status,
      metadata: { initiated_by: 'admin' },
    });

    return updateRes.rows[0];
  });

  return res.json({ data: result });
}

module.exports = { createJob, listJobs, getJob, changeCapacity, updateJobStatus };
