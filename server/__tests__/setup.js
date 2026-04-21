/**
 * Test setup: runs migrations before all tests, cleans DB between tests.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../..', '.env') });

const { pool } = require('../src/config/db');

beforeAll(async () => {
  // Run migrations inline
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    DO $$ BEGIN CREATE TYPE job_status AS ENUM ('open','paused','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE application_status AS ENUM ('active','waitlisted','acknowledged','rejected','withdrawn','decayed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE event_type AS ENUM ('applied','activated','waitlisted','promoted','acknowledged','rejected','withdrawn','decayed','requeued','capacity_changed','job_status_changed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, description TEXT,
      company_name TEXT NOT NULL, active_capacity INT NOT NULL CHECK (active_capacity > 0),
      decay_window_hours INT NOT NULL DEFAULT 24, status job_status NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS applicants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
      status application_status NOT NULL DEFAULT 'waitlisted', waitlist_position INT,
      decay_penalty_count INT NOT NULL DEFAULT 0, promoted_at TIMESTAMPTZ,
      acknowledge_deadline TIMESTAMPTZ, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(job_id, applicant_id)
    );
    CREATE TABLE IF NOT EXISTS pipeline_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      applicant_id UUID REFERENCES applicants(id) ON DELETE CASCADE,
      event_type event_type NOT NULL, from_status TEXT, to_status TEXT,
      from_position INT, to_position INT, metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      applicant_name TEXT NOT NULL, applicant_email TEXT NOT NULL,
      notification_type TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
      application_id UUID, job_id UUID, job_title TEXT,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}, 30000);

beforeEach(async () => {
  // TRUNCATE CASCADE handles FK constraints atomically and is faster than DELETE
  await pool.query('TRUNCATE notifications, pipeline_events, applications, applicants, jobs CASCADE');
});

afterAll(async () => {
  // Give pool a timeout to drain — forceExit handles anything still open
  await Promise.race([
    pool.end(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}, 12000);
