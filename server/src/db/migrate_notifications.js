require('dotenv').config({ path: require('path').resolve(__dirname, '../../..', '.env') });
const { pool } = require('../config/db');

/**
 * Migration: adds the notifications table for simulated email logging.
 * Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS guards).
 */
const ADD_NOTIFICATIONS_SQL = `
CREATE TABLE IF NOT EXISTS notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_name    TEXT NOT NULL,
  applicant_email   TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  subject           TEXT NOT NULL,
  body              TEXT NOT NULL,
  application_id    UUID,
  job_id            UUID,
  job_title         TEXT,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_sent_at    ON notifications(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_job_id     ON notifications(job_id);
CREATE INDEX IF NOT EXISTS idx_notifications_email      ON notifications(applicant_email);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running notifications migration...');
    await client.query(ADD_NOTIFICATIONS_SQL);
    console.log('✅ notifications table ready');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('❌ Top-level migration error:', err);
  process.exit(1);
});
