const { query, getClient } = require('../config/db');
const { applyToJob, acknowledgePromotion, exitPipeline } = require('../services/pipelineEngine');

/**
 * POST /api/jobs/:jobId/apply
 * Submit an application. Creates applicant if not exists.
 */
async function apply(req, res) {
  const { jobId } = req.params;
  const { name, email } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: { message: 'name is required' } });
  }
  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: { message: 'email is required' } });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({ error: { message: 'Invalid email format' } });
  }

  // Upsert applicant
  const applicantRes = await query(
    `INSERT INTO applicants (name, email)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [name.trim(), email.trim().toLowerCase()]
  );
  const applicant = applicantRes.rows[0];

  // Apply to the job (handles concurrency internally)
  const application = await applyToJob({ jobId, applicantId: applicant.id });

  return res.status(201).json({
    data: {
      application,
      applicant,
      message:
        application.status === 'active'
          ? 'You have been added as an active applicant. Please acknowledge your spot within the given window.'
          : `You are on the waitlist at position #${application.waitlist_position}.`,
    },
  });
}

/**
 * GET /api/applications/:id
 * Get application status + position + applicant info.
 */
async function getApplication(req, res) {
  const { id } = req.params;

  const result = await query(
    `SELECT a.*, ap.name, ap.email, j.title AS job_title, j.company_name,
            j.active_capacity, j.decay_window_hours
     FROM applications a
     JOIN applicants ap ON ap.id = a.applicant_id
     JOIN jobs j ON j.id = a.job_id
     WHERE a.id = $1`,
    [id]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: { message: 'Application not found' } });
  }

  const app = result.rows[0];

  // Compute queue position context for waitlisted applicants
  let ahead_count = null;
  if (app.status === 'waitlisted') {
    const aheadRes = await query(
      `SELECT COUNT(*) AS cnt FROM applications
       WHERE job_id = $1 AND status = 'waitlisted' AND waitlist_position < $2`,
      [app.job_id, app.waitlist_position]
    );
    ahead_count = parseInt(aheadRes.rows[0].cnt, 10);
  }

  return res.json({
    data: {
      ...app,
      ahead_count,
      time_remaining_ms:
        app.acknowledge_deadline
          ? Math.max(0, new Date(app.acknowledge_deadline).getTime() - Date.now())
          : null,
    },
  });
}

/**
 * POST /api/applications/:id/acknowledge
 * Applicant acknowledges their promotion.
 */
async function acknowledge(req, res) {
  const { id } = req.params;
  const app = await acknowledgePromotion(id);
  return res.json({
    data: app,
    message: 'Promotion acknowledged. You are now confirmed in the active pipeline.',
  });
}

/**
 * PATCH /api/applications/:id/exit
 * Company rejects or applicant withdraws.
 */
async function exit(req, res) {
  const { id } = req.params;
  const { reason } = req.body;

  if (!['rejected', 'withdrawn'].includes(reason)) {
    return res.status(400).json({ error: { message: "reason must be 'rejected' or 'withdrawn'" } });
  }

  const app = await exitPipeline(id, reason);
  return res.json({
    data: app,
    message: `Application ${reason}. Next waitlisted applicant has been notified.`,
  });
}

/**
 * GET /api/applications/:id/events
 * Full audit trail for a single application.
 */
async function getApplicationEvents(req, res) {
  const { id } = req.params;

  const appCheck = await query('SELECT id FROM applications WHERE id = $1', [id]);
  if (!appCheck.rows.length) {
    return res.status(404).json({ error: { message: 'Application not found' } });
  }

  const result = await query(
    `SELECT pe.*, ap.name AS applicant_name, ap.email AS applicant_email
     FROM pipeline_events pe
     JOIN applicants ap ON ap.id = pe.applicant_id
     WHERE pe.application_id = $1
     ORDER BY pe.created_at ASC`,
    [id]
  );

  return res.json({ data: result.rows });
}

module.exports = { apply, getApplication, acknowledge, exit, getApplicationEvents };
