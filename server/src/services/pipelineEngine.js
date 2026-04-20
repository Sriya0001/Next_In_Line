const { query, withTransaction } = require('../config/db');
const {
  notifyApplicationReceived,
  notifyPromotion,
  notifyAcknowledgementConfirmed,
  notifyDecay,
  notifyRejection,
  notifyWithdrawal,
} = require('./notificationService');

// ─── Constants ────────────────────────────────────────────────
const ACTIVE_STATUSES = ['active', 'acknowledged'];

/**
 * Log a pipeline event inside an existing transaction.
 * Always use this helper — never write to pipeline_events directly.
 */
async function logEvent(client, {
  applicationId,
  jobId,
  applicantId,
  eventType,
  fromStatus = null,
  toStatus = null,
  fromPosition = null,
  toPosition = null,
  metadata = {},
}) {
  await client.query(
    `INSERT INTO pipeline_events
      (application_id, job_id, applicant_id, event_type, from_status, to_status, from_position, to_position, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [applicationId, jobId, applicantId, eventType, fromStatus, toStatus, fromPosition, toPosition, JSON.stringify(metadata)]
  );
}

/**
 * Get the current count of active applicants for a job.
 * Must be called inside a transaction with FOR UPDATE on the job row.
 */
async function getActiveCount(client, jobId) {
  const res = await client.query(
    `SELECT COUNT(*) AS count FROM applications
     WHERE job_id = $1 AND status = ANY($2::application_status[])`,
    [jobId, ACTIVE_STATUSES]
  );
  return parseInt(res.rows[0].count, 10);
}

/**
 * Recalculates and normalises waitlist positions for a job.
 * Gaps created by promotions are closed sequentially (1,2,3,...).
 * Called inside a transaction.
 */
async function normaliseWaitlist(client, jobId) {
  await client.query(
    `WITH ranked AS (
       SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_position ASC, applied_at ASC) AS new_pos
       FROM applications
       WHERE job_id = $1 AND status = 'waitlisted'
     )
     UPDATE applications a
     SET waitlist_position = r.new_pos
     FROM ranked r
     WHERE a.id = r.id`,
    [jobId]
  );
}

/**
 * Internal helper for promoting the next waitlisted applicant.
 * Must be called inside a transaction (receives client).
 */
async function promoteNextInternal(client, jobId) {
  // Lock the job row to prevent concurrent promotions
  const jobRes = await client.query(
    'SELECT id, active_capacity, decay_window_hours, status FROM jobs WHERE id = $1 FOR UPDATE',
    [jobId]
  );
  if (!jobRes.rows.length) throw new Error(`Job ${jobId} not found`);
  const job = jobRes.rows[0];

  if (job.status !== 'open') return null;

  const activeCount = await getActiveCount(client, jobId);
  if (activeCount >= job.active_capacity) return null;

  const nextRes = await client.query(
    `SELECT a.*, ap.name, ap.email 
     FROM applications a
     JOIN applicants ap ON ap.id = a.applicant_id
     WHERE a.job_id = $1 AND a.status = 'waitlisted'
     ORDER BY a.waitlist_position ASC, a.applied_at ASC
     LIMIT 1
     FOR UPDATE OF a`,
    [jobId]
  );

  if (!nextRes.rows.length) return null;

  const app = nextRes.rows[0];
  const deadlineInterval = `${job.decay_window_hours} hours`;
  const deadlineISO = new Date(Date.now() + job.decay_window_hours * 3600000).toISOString();

  await client.query(
    `UPDATE applications
     SET status = 'active',
         waitlist_position = NULL,
         promoted_at = NOW(),
         acknowledge_deadline = NOW() + $1::interval
     WHERE id = $2`,
    [deadlineInterval, app.id]
  );

  await logEvent(client, {
    applicationId: app.id,
    jobId,
    applicantId: app.applicant_id,
    eventType: 'promoted',
    fromStatus: 'waitlisted',
    toStatus: 'active',
    fromPosition: app.waitlist_position,
    toPosition: null,
    metadata: { acknowledge_deadline: deadlineISO },
  });

  await normaliseWaitlist(client, jobId);

  // Fire simulated promotion email (non-blocking, does not affect transaction)
  const jobTitleRes = await client.query('SELECT title FROM jobs WHERE id = $1', [jobId]);
  const jobTitle = jobTitleRes.rows[0]?.title || 'the position';
  notifyPromotion({
    applicantName: app.name,
    applicantEmail: app.email,
    jobTitle,
    applicationId: app.id,
    jobId,
    deadlineISO,
  }).catch(() => {});

  return { ...app, status: 'active', waitlist_position: null };
}

/**
 * Public method for promoting the next applicant.
 * Acquires a new transaction with automatic retries.
 */
async function promoteNext(jobId) {
  return withTransaction(async (client) => {
    return promoteNextInternal(client, jobId);
  });
}

/**
 * APPLY for a job.
 *
 * Concurrency strategy:
 *   - Transaction isolation: SERIALIZABLE
 *   - The jobs row is SELECTed FOR UPDATE, serialising concurrent applies.
 *   - First committer wins the slot; subsequent readers see the updated count
 *     and fall to waitlist. No phantom reads, no lost updates.
 *
 * Returns the created application.
 */
async function applyToJob({ jobId, applicantId }) {
  return withTransaction(async (client) => {
    // Lock job row — this serialises concurrent apply requests
    const jobRes = await client.query(
      'SELECT id, active_capacity, decay_window_hours, status FROM jobs WHERE id = $1 FOR UPDATE',
      [jobId]
    );
    if (!jobRes.rows.length) throw Object.assign(new Error('Job not found'), { statusCode: 404 });
    const job = jobRes.rows[0];
    if (job.status !== 'open') throw Object.assign(new Error(`Job is ${job.status}`), { statusCode: 409 });

    // Prevent duplicate applications
    const dupRes = await client.query(
      'SELECT id FROM applications WHERE job_id = $1 AND applicant_id = $2',
      [jobId, applicantId]
    );
    if (dupRes.rows.length) throw Object.assign(new Error('Already applied to this job'), { statusCode: 409 });

    const activeCount = await getActiveCount(client, job.id);
    const isActive = activeCount < job.active_capacity;

    let insertRes;
    if (isActive) {
      insertRes = await client.query(
        `INSERT INTO applications (job_id, applicant_id, status, waitlist_position, promoted_at, acknowledge_deadline)
         VALUES ($1, $2, 'active', NULL, NOW(), NOW() + $3::interval)
         RETURNING *`,
        [jobId, applicantId, `${job.decay_window_hours} hours`]
      );
    } else {
      const posRes = await client.query(
        'SELECT COALESCE(MAX(waitlist_position), 0) + 1 AS next_pos FROM applications WHERE job_id = $1 AND status = \'waitlisted\'',
        [jobId]
      );
      const nextPos = posRes.rows[0].next_pos;

      insertRes = await client.query(
        `INSERT INTO applications (job_id, applicant_id, status, waitlist_position)
         VALUES ($1, $2, 'waitlisted', $3)
         RETURNING *`,
        [jobId, applicantId, nextPos]
      );
    }

    const newApp = insertRes.rows[0];

    await logEvent(client, {
      applicationId: newApp.id,
      jobId,
      applicantId,
      eventType: 'applied',
      fromStatus: null,
      toStatus: isActive ? 'active' : 'waitlisted',
      fromPosition: null,
      toPosition: isActive ? null : newApp.waitlist_position,
      metadata: { slot_won: isActive, active_count_at_apply: activeCount },
    });

    if (isActive) {
      await logEvent(client, {
        applicationId: newApp.id,
        jobId,
        applicantId,
        eventType: 'activated',
        fromStatus: 'waitlisted',
        toStatus: 'active',
        metadata: { reason: 'slot_available' },
      });
    } else {
      await logEvent(client, {
        applicationId: newApp.id,
        jobId,
        applicantId,
        eventType: 'waitlisted',
        fromStatus: null,
        toStatus: 'waitlisted',
        toPosition: newApp.waitlist_position,
        metadata: { active_count_at_apply: activeCount, capacity: job.active_capacity },
      });
    }

    // Fire simulated application-received email
    const jobTitleRes2 = await client.query('SELECT title FROM jobs WHERE id = $1', [jobId]);
    const jobTitle2 = jobTitleRes2.rows[0]?.title || 'the position';
    const applicantRes = await client.query('SELECT name, email FROM applicants WHERE id = $1', [applicantId]);
    const applicant = applicantRes.rows[0];
    if (applicant) {
      notifyApplicationReceived({
        applicantName: applicant.name,
        applicantEmail: applicant.email,
        jobTitle: jobTitle2,
        applicationId: newApp.id,
        jobId,
        status: isActive ? 'active' : 'waitlisted',
      }).catch(() => {});
    }

    return newApp;
  });
}

/**
 * ACKNOWLEDGE a promotion.
 * Converts 'active' → 'acknowledged', confirming the applicant is responsive.
 */
async function acknowledgePromotion(applicationId) {
  return withTransaction(async (client) => {
    const res = await client.query(
      'SELECT * FROM applications WHERE id = $1 FOR UPDATE',
      [applicationId]
    );
    if (!res.rows.length) throw Object.assign(new Error('Application not found'), { statusCode: 404 });
    const app = res.rows[0];

    if (app.status === 'acknowledged') return { ...app, status: 'acknowledged' };

    if (app.status !== 'active') {
      throw Object.assign(
        new Error(`Cannot acknowledge: application is '${app.status}', not 'active'`),
        { statusCode: 409 }
      );
    }

    await client.query(
      "UPDATE applications SET status = 'acknowledged', acknowledge_deadline = NULL WHERE id = $1",
      [applicationId]
    );

    await logEvent(client, {
      applicationId,
      jobId: app.job_id,
      applicantId: app.applicant_id,
      eventType: 'acknowledged',
      fromStatus: 'active',
      toStatus: 'acknowledged',
      metadata: { response_time_ms: Date.now() - new Date(app.promoted_at).getTime() },
    });

    // Fetch applicant + job details for notification
    const [ackApplicantRes, ackJobRes] = await Promise.all([
      client.query('SELECT name, email FROM applicants WHERE id = $1', [app.applicant_id]),
      client.query('SELECT title FROM jobs WHERE id = $1', [app.job_id]),
    ]);
    const ackApplicant = ackApplicantRes.rows[0];
    const ackJobTitle = ackJobRes.rows[0]?.title || 'the position';
    if (ackApplicant) {
      notifyAcknowledgementConfirmed({
        applicantName: ackApplicant.name,
        applicantEmail: ackApplicant.email,
        jobTitle: ackJobTitle,
        applicationId,
        jobId: app.job_id,
      }).catch(() => {});
    }

    return { ...app, status: 'acknowledged' };
  });
}

/**
 * EXIT pipeline — reject or withdraw an applicant.
 * Triggers automatic cascade promotion.
 */
async function exitPipeline(applicationId, exitType) {
  if (!['rejected', 'withdrawn'].includes(exitType)) {
    throw Object.assign(new Error("exitType must be 'rejected' or 'withdrawn'"), { statusCode: 400 });
  }

  return withTransaction(async (client) => {
    const res = await client.query(
      'SELECT * FROM applications WHERE id = $1 FOR UPDATE',
      [applicationId]
    );
    if (!res.rows.length) throw Object.assign(new Error('Application not found'), { statusCode: 404 });
    const app = res.rows[0];

    const wasActive = ACTIVE_STATUSES.includes(app.status);

    await client.query(
      `UPDATE applications SET status = $1, waitlist_position = NULL WHERE id = $2`,
      [exitType, applicationId]
    );

    await logEvent(client, {
      applicationId,
      jobId: app.job_id,
      applicantId: app.applicant_id,
      eventType: exitType,
      fromStatus: app.status,
      toStatus: exitType,
      fromPosition: app.waitlist_position,
      metadata: { initiated_by: 'company' },
    });

    // Fetch applicant + job for notification
    const [exitApplicantRes, exitJobRes] = await Promise.all([
      client.query('SELECT name, email FROM applicants WHERE id = $1', [app.applicant_id]),
      client.query('SELECT title FROM jobs WHERE id = $1', [app.job_id]),
    ]);
    const exitApplicant = exitApplicantRes.rows[0];
    const exitJobTitle = exitJobRes.rows[0]?.title || 'the position';
    if (exitApplicant) {
      if (exitType === 'rejected') {
        notifyRejection({
          applicantName: exitApplicant.name,
          applicantEmail: exitApplicant.email,
          jobTitle: exitJobTitle,
          applicationId,
          jobId: app.job_id,
        }).catch(() => {});
      } else {
        notifyWithdrawal({
          applicantName: exitApplicant.name,
          applicantEmail: exitApplicant.email,
          jobTitle: exitJobTitle,
          applicationId,
          jobId: app.job_id,
        }).catch(() => {});
      }
    }

    // If they held an active slot, cascade promotion inside the same transaction
    if (wasActive) {
      await promoteNextInternal(client, app.job_id);
    }

    return { ...app, status: exitType };
  });
}

/**
 * DECAY an applicant who failed to acknowledge within the window.
 *
 * Penalty calculation:
 *   penalty_position = floor(current_waitlist_length * 0.3) + 1
 *
 * This ensures:
 *   - Small waitlists (< 4): penalty = 1, they go to position 1 or 2
 *   - Medium waitlists (~10): penalty keeps them ~3 spots from front
 *   - Large waitlists (30+): significant penalty, still not permanent exclusion
 *   - Repeat decayers accumulate penalty_count, surfaced in UI as a warning signal
 */
async function decayApplication(applicationId) {
  return withTransaction(async (client) => {
    const res = await client.query(
      'SELECT a.*, j.active_capacity, j.decay_window_hours FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = $1 FOR UPDATE OF a',
      [applicationId]
    );
    if (!res.rows.length) return null;
    const app = res.rows[0];

    // Guard: only decay if still 'active' and past deadline
    if (app.status !== 'active' || !app.acknowledge_deadline || new Date(app.acknowledge_deadline) > new Date()) {
      return null;
    }

    // Count current waitlist length
    const wlRes = await client.query(
      "SELECT COUNT(*) AS len FROM applications WHERE job_id = $1 AND status = 'waitlisted'",
      [app.job_id]
    );
    const waitlistLen = parseInt(wlRes.rows[0].len, 10);

    // Penalty: 30% of waitlist length + 1 (minimum position 1)
    const penaltyOffset = Math.floor(waitlistLen * 0.3) + 1;
    const insertPosition = Math.min(penaltyOffset, waitlistLen + 1);

    // Shift existing waitlist entries down to make room
    if (insertPosition <= waitlistLen) {
      await client.query(
        `UPDATE applications
         SET waitlist_position = waitlist_position + 1
         WHERE job_id = $1 AND status = 'waitlisted' AND waitlist_position >= $2`,
        [app.job_id, insertPosition]
      );
    }

    // Re-insert decayed applicant at penalized position
    await client.query(
      `UPDATE applications
       SET status = 'waitlisted',
           waitlist_position = $1,
           promoted_at = NULL,
           acknowledge_deadline = NULL,
           decay_penalty_count = decay_penalty_count + 1
       WHERE id = $2`,
      [insertPosition, applicationId]
    );

    await logEvent(client, {
      applicationId,
      jobId: app.job_id,
      applicantId: app.applicant_id,
      eventType: 'decayed',
      fromStatus: 'active',
      toStatus: 'waitlisted',
      fromPosition: null,
      toPosition: insertPosition,
      metadata: {
        penalty_count: app.decay_penalty_count + 1,
        waitlist_len_at_decay: waitlistLen,
        penalty_offset: penaltyOffset,
        deadline_missed_by_ms: Date.now() - new Date(app.acknowledge_deadline).getTime(),
      },
    });

    await logEvent(client, {
      applicationId,
      jobId: app.job_id,
      applicantId: app.applicant_id,
      eventType: 'requeued',
      fromStatus: 'decayed',
      toStatus: 'waitlisted',
      fromPosition: null,
      toPosition: insertPosition,
      metadata: { reason: 'inactivity_penalty' },
    });

    // Fire simulated decay notification email
    const [decayApplicantRes, decayJobRes] = await Promise.all([
      client.query('SELECT name, email FROM applicants WHERE id = $1', [app.applicant_id]),
      client.query('SELECT title FROM jobs WHERE id = $1', [app.job_id]),
    ]);
    const decayApplicant = decayApplicantRes.rows[0];
    const decayJobTitle = decayJobRes.rows[0]?.title || 'the position';
    if (decayApplicant) {
      notifyDecay({
        applicantName: decayApplicant.name,
        applicantEmail: decayApplicant.email,
        jobTitle: decayJobTitle,
        applicationId,
        jobId: app.job_id,
        penaltyCount: app.decay_penalty_count + 1,
      }).catch(() => {});
    }

    // Trigger next promotion inside the transaction
    await promoteNextInternal(client, app.job_id);

    return { applicationId, newPosition: insertPosition };
  });
}

/**
 * UPDATE job capacity.
 * - Increase: immediately promote from waitlist to fill new slots
 * - Decrease: excess active applicants move to top of waitlist (position 0.x → renormalised)
 */
async function updateCapacity(jobId, newCapacity) {
  return withTransaction(async (client) => {
    const jobRes = await client.query(
      'SELECT * FROM jobs WHERE id = $1 FOR UPDATE',
      [jobId]
    );
    if (!jobRes.rows.length) throw Object.assign(new Error('Job not found'), { statusCode: 404 });
    const job = jobRes.rows[0];
    const oldCapacity = job.active_capacity;

    await client.query(
      'UPDATE jobs SET active_capacity = $1 WHERE id = $2',
      [newCapacity, jobId]
    );

    await logEvent(client, {
      jobId,
      eventType: 'capacity_changed',
      metadata: { old_capacity: oldCapacity, new_capacity: newCapacity },
    });

    const activeCount = await getActiveCount(client, jobId);

    if (newCapacity < activeCount) {
      const surplus = activeCount - newCapacity;
      const overflowRes = await client.query(
        `SELECT id, applicant_id, applied_at FROM applications
         WHERE job_id = $1 AND status = ANY($2::application_status[])
         ORDER BY promoted_at DESC NULLS LAST
         LIMIT $3
         FOR UPDATE`,
        [jobId, ACTIVE_STATUSES, surplus]
      );

      await client.query(
        `UPDATE applications SET waitlist_position = waitlist_position + $1
         WHERE job_id = $2 AND status = 'waitlisted'`,
        [surplus, jobId]
      );

      for (let i = 0; i < overflowRes.rows.length; i++) {
        const ovApp = overflowRes.rows[i];
        await client.query(
          `UPDATE applications 
           SET status = 'waitlisted', waitlist_position = $1, promoted_at = NULL, acknowledge_deadline = NULL
           WHERE id = $2`,
          [i + 1, ovApp.id]
        );
        await logEvent(client, {
          applicationId: ovApp.id,
          jobId,
          applicantId: ovApp.applicant_id,
          eventType: 'waitlisted',
          fromStatus: 'acknowledged',
          toStatus: 'waitlisted',
          toPosition: i + 1,
          metadata: { reason: 'capacity_reduced' },
        });
      }
    }

    if (newCapacity > oldCapacity) {
      const currentActive = await getActiveCount(client, jobId);
      const toPromote = Math.max(0, newCapacity - currentActive);
      
      for (let i = 0; i < toPromote; i++) {
        await promoteNextInternal(client, jobId);
      }
    }

    return { jobId, oldCapacity, newCapacity };
  });
}

module.exports = {
  applyToJob,
  acknowledgePromotion,
  exitPipeline,
  decayApplication,
  promoteNext,
  updateCapacity,
  logEvent,
  normaliseWaitlist,
};
