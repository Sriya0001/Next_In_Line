const { getClient } = require('../config/db');

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
 * Promotes the next waitlisted applicant for a job.
 * Returns the promoted application row, or null if waitlist is empty.
 * This function acquires its own transaction — do NOT call inside another txn.
 */
async function promoteNext(jobId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lock the job row to prevent concurrent promotions
    const jobRes = await client.query(
      'SELECT id, active_capacity, decay_window_hours FROM jobs WHERE id = $1 FOR UPDATE',
      [jobId]
    );
    if (!jobRes.rows.length) throw new Error(`Job ${jobId} not found`);
    const job = jobRes.rows[0];

    // Do not promote if the job is paused or closed.
    // A paused job halts the cascade — no new applicants should be activated
    // until the company explicitly re-opens it.
    if (job.status !== 'open') {
      await client.query('COMMIT');
      return null;
    }

    const activeCount = await getActiveCount(client, jobId);
    if (activeCount >= job.active_capacity) {
      // No slot available — nothing to promote
      await client.query('COMMIT');
      return null;
    }

    // Find next in waitlist (lowest position wins; ties broken by applied_at)
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

    if (!nextRes.rows.length) {
      await client.query('COMMIT');
      return null;
    }

    const app = nextRes.rows[0];
    const deadlineInterval = `${job.decay_window_hours} hours`;

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
      metadata: { acknowledge_deadline: new Date(Date.now() + job.decay_window_hours * 3600000).toISOString() },
    });

    // Close waitlist gaps
    await normaliseWaitlist(client, jobId);

    await client.query('COMMIT');
    return { ...app, status: 'active', waitlist_position: null };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
  const client = await getClient();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');

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
      // Slot available — go straight to active
      insertRes = await client.query(
        `INSERT INTO applications (job_id, applicant_id, status, waitlist_position, promoted_at, acknowledge_deadline)
         VALUES ($1, $2, 'active', NULL, NOW(), NOW() + $3::interval)
         RETURNING *`,
        [jobId, applicantId, `${job.decay_window_hours} hours`]
      );
    } else {
      // No slot — waitlisted at end of queue
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

    // Log the apply event
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

    await client.query('COMMIT');
    return newApp;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * ACKNOWLEDGE a promotion.
 * Converts 'active' → 'acknowledged', confirming the applicant is responsive.
 */
async function acknowledgePromotion(applicationId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const res = await client.query(
      'SELECT * FROM applications WHERE id = $1 FOR UPDATE',
      [applicationId]
    );
    if (!res.rows.length) throw Object.assign(new Error('Application not found'), { statusCode: 404 });
    const app = res.rows[0];

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

    await client.query('COMMIT');
    return { ...app, status: 'acknowledged' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * EXIT pipeline — reject or withdraw an applicant.
 * Triggers automatic cascade promotion.
 */
async function exitPipeline(applicationId, exitType) {
  if (!['rejected', 'withdrawn'].includes(exitType)) {
    throw Object.assign(new Error("exitType must be 'rejected' or 'withdrawn'"), { statusCode: 400 });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

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

    await client.query('COMMIT');

    // If they held an active slot, cascade promotion
    if (wasActive) {
      await promoteNext(app.job_id);
    }

    return { ...app, status: exitType };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
  const client = await getClient();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');

    const res = await client.query(
      'SELECT a.*, j.active_capacity, j.decay_window_hours FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = $1 FOR UPDATE OF a',
      [applicationId]
    );
    if (!res.rows.length) {
      await client.query('COMMIT');
      return null;
    }
    const app = res.rows[0];

    // Guard: only decay if still 'active' and past deadline
    if (app.status !== 'active' || !app.acknowledge_deadline || new Date(app.acknowledge_deadline) > new Date()) {
      await client.query('COMMIT');
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

    await client.query('COMMIT');

    // Trigger next promotion to fill the vacated slot
    await promoteNext(app.job_id);

    return { applicationId, newPosition: insertPosition };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * UPDATE job capacity.
 * - Increase: immediately promote from waitlist to fill new slots
 * - Decrease: excess active applicants move to top of waitlist (position 0.x → renormalised)
 */
async function updateCapacity(jobId, newCapacity) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

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
      // Overflow: demote last-added active applicants to front of waitlist
      const surplus = activeCount - newCapacity;
      const overflowRes = await client.query(
        `SELECT id, applicant_id, applied_at FROM applications
         WHERE job_id = $1 AND status = ANY($2::application_status[])
         ORDER BY promoted_at DESC NULLS LAST
         LIMIT $3
         FOR UPDATE`,
        [jobId, ACTIVE_STATUSES, surplus]
      );

      // Shift current waitlist down
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

    await client.query('COMMIT');

    // If capacity increased, promote to fill new slots
    if (newCapacity > oldCapacity) {
      // Get fresh count after commit to ensure we promote the right number
      const currentActive = await getActiveCount(client, jobId);
      const toPromote = Math.max(0, newCapacity - currentActive);
      
      for (let i = 0; i < toPromote; i++) {
        const promoted = await promoteNext(jobId);
        if (!promoted) break; 
      }
    }

    return { jobId, oldCapacity, newCapacity };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
