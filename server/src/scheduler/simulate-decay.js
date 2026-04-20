require('dotenv').config({ path: require('path').resolve(__dirname, '../../..', '.env') });
const { query, pool } = require('../config/db');
const { triggerDecayCycle } = require('./decayScheduler');

async function runSimulation() {
  console.log('🚀 Starting decay simulation...');

  try {
    // 1. Find an active application that hasn't expired yet
    const res = await query(
      `SELECT a.id, ap.name 
       FROM applications a
       JOIN applicants ap ON a.applicant_id = ap.id
       WHERE a.status = 'active'
       LIMIT 1`
    );

    if (res.rows.length === 0) {
      console.log('⚠️ No active applicants found to decay. Please seed the DB or apply first.');
      return;
    }

    const app = res.rows[0];
    console.log(`⏳ Fast-forwarding time for applicant: ${app.name} (${app.id})...`);

    // 2. Forcibly expire their deadline
    await query(
      `UPDATE applications 
       SET acknowledge_deadline = NOW() - interval '1 hour' 
       WHERE id = $1`,
      [app.id]
    );

    console.log(`⏱️ Deadline moved to the past. Triggering decay scheduler...`);

    // 3. Trigger the scheduler manually
    await triggerDecayCycle();

    console.log('🎉 Simulation complete! Check the UI or database to see the waitlist cascade.');
  } catch (err) {
    console.error('❌ Simulation failed:', err);
  } finally {
    // Graceful exit
    await pool.end();
  }
}

runSimulation();
