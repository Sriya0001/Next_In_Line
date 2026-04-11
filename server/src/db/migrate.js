require('dotenv').config({ path: require('path').resolve(__dirname, '../../..', '.env') });
const { pool } = require('../config/db');

const MIGRATION_SQL = `
-- ─── Enable UUID extension ────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUMs ───────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('open', 'paused', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE application_status AS ENUM (
    'active',
    'waitlisted',
    'acknowledged',
    'rejected',
    'withdrawn',
    'decayed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM (
    'applied',
    'activated',
    'waitlisted',
    'promoted',
    'acknowledged',
    'rejected',
    'withdrawn',
    'decayed',
    'requeued',
    'capacity_changed',
    'job_status_changed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Jobs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  description         TEXT,
  company_name        TEXT NOT NULL,
  active_capacity     INT NOT NULL CHECK (active_capacity > 0),
  decay_window_hours  INT NOT NULL DEFAULT 24 CHECK (decay_window_hours > 0),
  status              job_status NOT NULL DEFAULT 'open',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Applicants ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applicants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Applications ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id               UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_id         UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  status               application_status NOT NULL DEFAULT 'waitlisted',
  waitlist_position    INT,                       -- NULL when active/acknowledged
  decay_penalty_count  INT NOT NULL DEFAULT 0,    -- How many times they've decayed
  promoted_at          TIMESTAMPTZ,               -- When last promoted to active
  acknowledge_deadline TIMESTAMPTZ,               -- promoted_at + decay_window_hours
  applied_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, applicant_id)                    -- One application per job
);

-- ─── Audit Log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_id    UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  event_type      event_type NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  from_position   INT,
  to_position     INT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_waitlist ON applications(job_id, waitlist_position) 
  WHERE waitlist_position IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_decay ON applications(job_id, acknowledge_deadline)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_events_job_id ON pipeline_events(job_id);
CREATE INDEX IF NOT EXISTS idx_events_application_id ON pipeline_events(application_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON pipeline_events(created_at DESC);

-- ─── Auto-update updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_applications_updated_at ON applications;
CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running migrations...');
    await client.query(MIGRATION_SQL);
    console.log('✅ Migrations complete');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
