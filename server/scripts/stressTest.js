/**
 * ⚡ Next In Line - Stress Test Script
 * 
 * Purpose: Fires 60+ concurrent "Apply" requests to a single job to prove
 * that SERIALIZABLE transactions and row-level locks prevent over-filling.
 * 
 * Usage: 
 *   export STRESS_TEST=true
 *   node server/scripts/stressTest.js
 */

require('dotenv').config();
const request = require('supertest');
const app = require('../src/app');
const { connectDB, getClient } = require('../src/config/db');
const { v4: uuidv4 } = require('uuid');

async function runStressTest() {
  console.log('🚀 Starting Stress Test...');
  
  try {
    await connectDB();
    console.log('✅ Connected to database');

    const jobData = {
      title: 'Stress Test Engineer',
      company_name: 'Antigravity Labs',
      active_capacity: 10,
      decay_window_hours: 24,
      description: 'Handling extreme pressure.'
    };

    // 1. Create a fresh job
    console.log('📦 Creating test job...');
    const jobRes = await request(app)
      .post('/api/jobs')
      .send(jobData);
    
    if (jobRes.status !== 201) {
      throw new Error(`Failed to create job: ${JSON.stringify(jobRes.body)}`);
    }
    const job = jobRes.body.data;
    console.log(`✅ Job created with ID: ${job.id} (Capacity: ${job.active_capacity})`);

    // 2. Fire 60 concurrent Apply requests
    const CONCURRENT_APPLICANTS = 60;
    console.log(`🔥 Firing ${CONCURRENT_APPLICANTS} concurrent applications...`);
    
    const applyRequests = [];
    for (let i = 0; i < CONCURRENT_APPLICANTS; i++) {
      const applicantName = `Applicant ${i}`;
      const applicantEmail = `stress_${uuidv4().slice(0, 8)}@example.com`;
      
      const fireApply = async (attempt = 1) => {
        try {
          const res = await request(app)
            .post(`/api/jobs/${job.id}/apply`)
            .set('x-stress-test', 'true')
            .send({ name: applicantName, email: applicantEmail });
          
          // Serialization failure (40001) or deadlock (40P01) — retry up to 5 times
          if (res.status === 500 && res.body.error && (res.body.error.message.includes('40001') || res.body.error.message.includes('40P01'))) {
            if (attempt < 5) {
              console.log(`   🔄 Retrying Applicant ${i} (Attempt ${attempt + 1}) due to serialization failure...`);
              return fireApply(attempt + 1);
            }
          }
          
          return {
            status: res.status,
            body: res.body,
            index: i
          };
        } catch (err) {
          return {
            error: err.message,
            index: i
          };
        }
      };

      applyRequests.push(fireApply());
    }

    const startTime = Date.now();
    const results = await Promise.all(applyRequests);
    const endTime = Date.now();
    
    console.log(`⏱️ All requests finished in ${endTime - startTime}ms`);

    // 3. Analyze results
    const successes = results.filter(r => r.status === 201).length;
    const conflicts = results.filter(r => r.status === 409).length;
    const serializationFailures = results.filter(r => r.status === 500 && r.body.error && r.body.error.message.includes('serialize')).length;
    const errors = results.filter(r => !r.status || (r.status !== 201 && r.status !== 409)).length;

    console.log('\n📊 APPLY RESULTS:');
    console.log(`   Success:               ${successes}`);
    console.log(`   Conflicts (Expected):  ${conflicts}`);
    console.log(`   Serialization Fails:   ${serializationFailures}`);
    console.log(`   Other Errors:          ${errors}`);

    if (errors > 0) {
      console.log('⚠️ Unexpected errors:', results.filter(r => !r.status || (r.status !== 201 && r.status !== 409 && r.status !== 500)).map(r => r.body || r.error));
    }

    // 4. Verify Database Integrity
    console.log('\n🔍 Verifying Data Integrity...');
    const pipelineRes = await request(app).get(`/api/pipeline/${job.id}`);
    const { active, waitlist } = pipelineRes.body.data;

    console.log(`   Active Count:    ${active.length}`);
    console.log(`   Waitlist Count:  ${waitlist.length}`);
    console.log(`   Total Tracked:   ${active.length + waitlist.length}`);

    const expectedActive = Math.min(successes, job.active_capacity);
    const integrityPass = active.length === expectedActive;

    if (integrityPass) {
      console.log('✅ INTEGRITY CHECK PASSED: Active count matches capacity.');
    } else {
      console.error(`❌ INTEGRITY CHECK FAILED: Expected ${expectedActive} active, found ${active.length}`);
    }

    // 5. Stress Acknowledge
    console.log('\n⚡ Firing concurrent Acknowledge requests for active applicants...');
    const ackRequests = active.map(record => 
      request(app)
        .post(`/api/applications/${record.id}/acknowledge`)
        .then(res => ({ status: res.status, id: record.id }))
    );
    
    const ackResults = await Promise.all(ackRequests);
    const ackSuccesses = ackResults.filter(r => r.status === 200).length;
    console.log(`   Ack Success: ${ackSuccesses}/${active.length}`);

    console.log('\n🏆 Stress Test Complete.');
    process.exit(integrityPass ? 0 : 1);

  } catch (err) {
    console.error('💥 Stress Test Crashed:', err);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  process.env.STRESS_TEST = 'true';
  runStressTest();
}
