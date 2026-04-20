const { query } = require('../config/db');

/**
 * GET /api/admin/notifications
 * Returns the most recent 100 simulated notifications, optionally filtered by job.
 */
async function listNotifications(req, res) {
  const { job_id, limit = 100 } = req.query;

  let sql = `
    SELECT id, applicant_name, applicant_email, notification_type, subject, body,
           application_id, job_id, job_title, sent_at
    FROM notifications
  `;
  const params = [];

  if (job_id) {
    params.push(job_id);
    sql += ` WHERE job_id = $${params.length}`;
  }

  params.push(Math.min(parseInt(limit, 10) || 100, 500));
  sql += ` ORDER BY sent_at DESC LIMIT $${params.length}`;

  const result = await query(sql, params);
  return res.json({ data: result.rows });
}

/**
 * GET /api/admin/notifications/stats
 * Returns aggregated counts grouped by notification_type.
 */
async function notificationStats(req, res) {
  const result = await query(
    `SELECT notification_type, COUNT(*) AS count
     FROM notifications
     GROUP BY notification_type
     ORDER BY count DESC`,
    []
  );
  return res.json({ data: result.rows });
}

module.exports = { listNotifications, notificationStats };
