const { query } = require('../config/db');
const { decayApplication } = require('../services/pipelineEngine');

let schedulerInterval = null;
let isRunning = false;

const POLL_INTERVAL_MS = parseInt(process.env.DECAY_POLL_INTERVAL_MS || '300000', 10); // 5 min default

/**
 * Custom inactivity decay scheduler.
 *
 * How it works:
 *   1. Runs every DECAY_POLL_INTERVAL_MS (default 5 minutes)
 *   2. Queries all 'active' applications past their acknowledge_deadline
 *   3. For each expired application, calls decayApplication()
 *      which: re-queues at penalized position + triggers promoteNext()
 *   4. The cascade continues: promoteNext() may find another promoted applicant
 *      who also missed their window in a previous cycle (already handled by next poll)
 *
 * No third-party job scheduling library is used — this is a deliberate
 * architectural choice to keep dependencies minimal and the logic fully transparent.
 *
 * Concurrency guard: isRunning flag prevents overlapping polls if a poll
 * takes longer than the interval (e.g. large cascade).
 */
async function runDecayCycle() {
  if (isRunning) {
    console.warn('⏭️  Decay scheduler: previous cycle still running, skipping');
    return;
  }
  isRunning = true;

  try {
    const expired = await query(
      `SELECT a.id, a.job_id, a.applicant_id, a.acknowledge_deadline,
              ap.name, ap.email
       FROM applications a
       JOIN applicants ap ON ap.id = a.applicant_id
       WHERE a.status = 'active'
         AND a.acknowledge_deadline IS NOT NULL
         AND a.acknowledge_deadline < NOW()
       ORDER BY a.acknowledge_deadline ASC`,
      []
    );

    if (expired.rows.length === 0) {
      return;
    }

    console.log(`⏰ Decay scheduler: found ${expired.rows.length} expired promotion(s)`);

    for (const app of expired.rows) {
      try {
        const result = await decayApplication(app.id);
        if (result) {
          const overdueMs = Date.now() - new Date(app.acknowledge_deadline).getTime();
          console.log(
            `  🔄 Decayed application ${app.id} (${app.name}) → waitlist pos ${result.newPosition}` +
            ` | overdue by ${Math.round(overdueMs / 60000)}min`
          );
        }
      } catch (err) {
        // Log but don't halt the cycle — process remaining applications
        console.error(`  ❌ Failed to decay application ${app.id}:`, err.message);
      }
    }

    console.log(`✅ Decay cycle complete — processed ${expired.rows.length} application(s)`);
  } catch (err) {
    console.error('❌ Decay scheduler error:', err);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the decay scheduler.
 */
function startDecayScheduler() {
  if (schedulerInterval) {
    console.warn('Decay scheduler already running');
    return;
  }

  console.log(`🕐 Decay scheduler started (interval: ${POLL_INTERVAL_MS / 1000}s)`);

  // Run once immediately on startup to catch anything that expired while server was down
  runDecayCycle();

  schedulerInterval = setInterval(runDecayCycle, POLL_INTERVAL_MS);
  // Allow process to exit even if interval is running
  if (schedulerInterval.unref) schedulerInterval.unref();
}

/**
 * Stop the decay scheduler (used in tests).
 */
function stopDecayScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('🛑 Decay scheduler stopped');
  }
}

/**
 * Manually trigger one decay cycle (used in tests and admin endpoint).
 */
async function triggerDecayCycle() {
  return runDecayCycle();
}

module.exports = { startDecayScheduler, stopDecayScheduler, triggerDecayCycle };
