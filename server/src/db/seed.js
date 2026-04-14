require('dotenv').config({ path: require('path').resolve(__dirname, '../../..', '.env') });
const { pool } = require('../config/db');

/**
 * Seed script — creates a realistic demo dataset:
 *  - 1 company job (Senior Backend Engineer, capacity=3, decay=24h)
 *  - 6 applicants (3 active, 3 waitlisted, 1 with a pending decay deadline)
 */
async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🌱 Seeding database...');

    // Clear existing data
    await client.query('DELETE FROM pipeline_events');
    await client.query('DELETE FROM applications');
    await client.query('DELETE FROM applicants');
    await client.query('DELETE FROM jobs');

    // Create job
    const jobRes = await client.query(`
      INSERT INTO jobs (title, description, company_name, active_capacity, decay_window_hours, status)
      VALUES ($1, $2, $3, $4, $5, 'open')
      RETURNING id
    `, [
      'Senior Backend Engineer',
      'Build scalable APIs and own our infrastructure. Must love Postgres.',
      'Acme Corp',
      3,
      24,
    ]);
    const jobId = jobRes.rows[0].id;
    console.log(`  ✅ Created job: ${jobId}`);

    // Create applicants
    const applicantData = [
      { name: 'Alice Chen', email: 'alice@example.com' },
      { name: 'Bob Nakamura', email: 'bob@example.com' },
      { name: 'Carol Osei', email: 'carol@example.com' },
      { name: 'Dan Reyes', email: 'dan@example.com' },
      { name: 'Eva Lindström', email: 'eva@example.com' },
      { name: 'Faiz Rahman', email: 'faiz@example.com' },
    ];

    const applicantIds = [];
    for (const a of applicantData) {
      const res = await client.query(
        'INSERT INTO applicants (name, email) VALUES ($1, $2) RETURNING id',
        [a.name, a.email]
      );
      applicantIds.push(res.rows[0].id);
    }
    console.log(`  ✅ Created ${applicantIds.length} applicants`);

    // Insert active applicants (slots 1-3)
    for (let i = 0; i < 3; i++) {
      const appRes = await client.query(`
        INSERT INTO applications 
          (job_id, applicant_id, status, waitlist_position, promoted_at, acknowledge_deadline)
        VALUES ($1, $2, 'acknowledged', NULL, NOW() - INTERVAL '2 hours', NOW() + INTERVAL '22 hours')
        RETURNING id
      `, [jobId, applicantIds[i]]);

      await client.query(`
        INSERT INTO pipeline_events 
          (application_id, job_id, applicant_id, event_type, from_status, to_status, metadata)
        VALUES ($1, $2, $3, 'applied', NULL, 'active', '{"note": "seed data"}')
      `, [appRes.rows[0].id, jobId, applicantIds[i]]);

      await client.query(`
        INSERT INTO pipeline_events 
          (application_id, job_id, applicant_id, event_type, from_status, to_status)
        VALUES ($1, $2, $3, 'activated', NULL, 'active')
      `, [appRes.rows[0].id, jobId, applicantIds[i]]);

      await client.query(`
        INSERT INTO pipeline_events 
          (application_id, job_id, applicant_id, event_type, from_status, to_status)
        VALUES ($1, $2, $3, 'acknowledged', 'active', 'acknowledged')
      `, [appRes.rows[0].id, jobId, applicantIds[i]]);
    }

    // Insert waitlisted applicants (positions 1-3)
    for (let i = 3; i < 6; i++) {
      const position = i - 2; // 1, 2, 3
      const appRes = await client.query(`
        INSERT INTO applications 
          (job_id, applicant_id, status, waitlist_position)
        VALUES ($1, $2, 'waitlisted', $3)
        RETURNING id
      `, [jobId, applicantIds[i], position]);

      await client.query(`
        INSERT INTO pipeline_events 
          (application_id, job_id, applicant_id, event_type, from_status, to_status, to_position, metadata)
        VALUES ($1, $2, $3, 'waitlisted', NULL, 'waitlisted', $4, '{"note": "seed data"}')
      `, [appRes.rows[0].id, jobId, applicantIds[i], position]);
    }

    await client.query('COMMIT');
    console.log('✅ Seed complete');
    console.log(`\n📋 Job ID: ${jobId}`);
    console.log('   Active: Alice, Bob, Carol');
    console.log('   Waitlisted: Dan (#1), Eva (#2), Faiz (#3)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
