require('./setup');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');
const { stopDecayScheduler } = require('../src/scheduler/decayScheduler');

beforeAll(() => stopDecayScheduler());

// Helper: create a job
async function createJob(overrides = {}) {
  const res = await request(app).post('/api/jobs').send({
    title: 'Test Engineer',
    company_name: 'Test Co',
    active_capacity: 2,
    decay_window_hours: 24,
    ...overrides,
  });
  return res.body.data;
}

// Helper: apply to a job
async function applyToJob(jobId, email, name) {
  const res = await request(app)
    .post(`/api/jobs/${jobId}/apply`)
    .send({ name: name || `Applicant ${email}`, email });
  return res.body;
}

// ─── Job CRUD Tests ───────────────────────────────────────────

describe('POST /api/jobs', () => {
  it('creates a job with valid data', async () => {
    const res = await request(app).post('/api/jobs').send({
      title: 'Backend Engineer',
      company_name: 'Acme',
      active_capacity: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Backend Engineer');
    expect(res.body.data.active_capacity).toBe(3);
    expect(res.body.data.status).toBe('open');
  });

  it('rejects invalid capacity', async () => {
    const res = await request(app).post('/api/jobs').send({
      title: 'Engineer', company_name: 'Co', active_capacity: 0,
    });
    expect(res.status).toBe(400);
  });

  it('rejects missing title', async () => {
    const res = await request(app).post('/api/jobs').send({
      company_name: 'Co', active_capacity: 2,
    });
    expect(res.status).toBe(400);
  });
});

// ─── Apply Tests ──────────────────────────────────────────────

describe('POST /api/jobs/:jobId/apply', () => {
  it('activates applicant when slot is available', async () => {
    const job = await createJob({ active_capacity: 2 });
    const res = await applyToJob(job.id, 'alice@test.com', 'Alice');
    expect(res.data.application.status).toBe('active');
    expect(res.data.application.waitlist_position).toBeNull();
  });

  it('waitlists when capacity is full', async () => {
    const job = await createJob({ active_capacity: 1 });
    await applyToJob(job.id, 'alice@test.com', 'Alice');
    const res = await applyToJob(job.id, 'bob@test.com', 'Bob');
    expect(res.data.application.status).toBe('waitlisted');
    expect(res.data.application.waitlist_position).toBe(1);
  });

  it('rejects duplicate applications', async () => {
    const job = await createJob({ active_capacity: 2 });
    await applyToJob(job.id, 'alice@test.com', 'Alice');
    const res = await request(app)
      .post(`/api/jobs/${job.id}/apply`)
      .send({ name: 'Alice', email: 'alice@test.com' });
    expect(res.status).toBe(409);
  });

  it('rejects applying to non-existent job', async () => {
    const res = await request(app)
      .post('/api/jobs/00000000-0000-0000-0000-000000000000/apply')
      .send({ name: 'Alice', email: 'alice@test.com' });
    expect(res.status).toBe(404);
  });

  it('waitlists correctly assigns sequential positions', async () => {
    const job = await createJob({ active_capacity: 1 });
    await applyToJob(job.id, 'alice@test.com', 'Alice'); // active
    const b = await applyToJob(job.id, 'bob@test.com', 'Bob');
    const c = await applyToJob(job.id, 'carol@test.com', 'Carol');
    expect(b.data.application.waitlist_position).toBe(1);
    expect(c.data.application.waitlist_position).toBe(2);
  });
});

// ─── Concurrency Test ─────────────────────────────────────────

describe('Concurrency: race condition for last slot', () => {
  it('only one applicant wins the last slot when two apply simultaneously', async () => {
    const job = await createJob({ active_capacity: 1 });

    // Both apply concurrently
    const [resA, resB] = await Promise.all([
      request(app).post(`/api/jobs/${job.id}/apply`).send({ name: 'Alice', email: 'alice@race.com' }),
      request(app).post(`/api/jobs/${job.id}/apply`).send({ name: 'Bob', email: 'bob@race.com' }),
    ]);

    const statuses = [resA.body.data?.application?.status, resB.body.data?.application?.status];
    const bothOk = resA.status === 201 && resB.status === 201;

    if (bothOk) {
      // Both requests succeeded — one must be active, one must be waitlisted
      expect(statuses).toContain('active');
      expect(statuses).toContain('waitlisted');
    } else {
      // One serialization failure is acceptable — the other should have succeeded
      const successStatuses = [resA, resB]
        .filter(r => r.status === 201)
        .map(r => r.body.data.application.status);
      expect(successStatuses).toContain('active');
    }

    // Verify DB state: exactly 1 active
    const dbRes = await pool.query(
      "SELECT COUNT(*) AS cnt FROM applications WHERE job_id = $1 AND status = 'active'",
      [job.id]
    );
    expect(parseInt(dbRes.rows[0].cnt, 10)).toBe(1);
  });
});

// ─── Acknowledge & Exit Tests ─────────────────────────────────

describe('POST /api/applications/:id/acknowledge', () => {
  it('acknowledges an active application', async () => {
    const job = await createJob({ active_capacity: 2 });
    const applyRes = await applyToJob(job.id, 'alice@test.com', 'Alice');
    const appId = applyRes.data.application.id;

    const res = await request(app).post(`/api/applications/${appId}/acknowledge`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('acknowledged');
  });

  it('cannot acknowledge a waitlisted application', async () => {
    const job = await createJob({ active_capacity: 1 });
    await applyToJob(job.id, 'alice@test.com', 'Alice');
    const bobRes = await applyToJob(job.id, 'bob@test.com', 'Bob');
    const appId = bobRes.data.application.id;

    const res = await request(app).post(`/api/applications/${appId}/acknowledge`);
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/applications/:id/exit', () => {
  it('promotes next waitlisted applicant on rejection', async () => {
    const job = await createJob({ active_capacity: 1 });
    const aliceRes = await applyToJob(job.id, 'alice@test.com', 'Alice');
    const bobRes = await applyToJob(job.id, 'bob@test.com', 'Bob');

    const aliceAppId = aliceRes.data.application.id;
    const bobAppId = bobRes.data.application.id;

    // Reject Alice — Bob should be promoted
    const exitRes = await request(app)
      .patch(`/api/applications/${aliceAppId}/exit`)
      .send({ reason: 'rejected' });
    expect(exitRes.status).toBe(200);

    // Wait briefly for async promoteNext
    await new Promise(r => setTimeout(r, 200));

    const bobStatus = await request(app).get(`/api/applications/${bobAppId}`);
    expect(bobStatus.body.data.status).toBe('active');
  });

  it('rejects invalid exit reason', async () => {
    const job = await createJob({ active_capacity: 2 });
    const applyRes = await applyToJob(job.id, 'alice@test.com', 'Alice');
    const res = await request(app)
      .patch(`/api/applications/${applyRes.data.application.id}/exit`)
      .send({ reason: 'ghosted' });
    expect(res.status).toBe(400);
  });
});

// ─── Pipeline Snapshot ────────────────────────────────────────

describe('GET /api/pipeline/:jobId', () => {
  it('returns correct snapshot with active and waitlist', async () => {
    const job = await createJob({ active_capacity: 2 });
    await applyToJob(job.id, 'alice@test.com', 'Alice');
    await applyToJob(job.id, 'bob@test.com', 'Bob');
    await applyToJob(job.id, 'carol@test.com', 'Carol'); // waitlist

    const res = await request(app).get(`/api/pipeline/${job.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.active).toHaveLength(2);
    expect(res.body.data.waitlist).toHaveLength(1);
    expect(res.body.data.capacity_used).toBe(2);
    expect(res.body.data.capacity_available).toBe(0);
  });
});

// ─── Capacity Change Tests ────────────────────────────────────

describe('PATCH /api/jobs/:id/capacity', () => {
  it('promotes from waitlist when capacity increases', async () => {
    const job = await createJob({ active_capacity: 1 });
    await applyToJob(job.id, 'alice@test.com', 'Alice'); // active
    const bobRes = await applyToJob(job.id, 'bob@test.com', 'Bob'); // waitlist
    const bobAppId = bobRes.data.application.id;

    const res = await request(app)
      .patch(`/api/jobs/${job.id}/capacity`)
      .send({ active_capacity: 2 });
    expect(res.status).toBe(200);

    await new Promise(r => setTimeout(r, 200));

    const bobStatus = await request(app).get(`/api/applications/${bobAppId}`);
    expect(bobStatus.body.data.status).toBe('active');
  });

  it('demotes to waitlist when capacity decreases', async () => {
    const job = await createJob({ active_capacity: 3 });
    await applyToJob(job.id, 'alice@test.com', 'Alice');
    await applyToJob(job.id, 'bob@test.com', 'Bob');
    await applyToJob(job.id, 'carol@test.com', 'Carol');

    const res = await request(app)
      .patch(`/api/jobs/${job.id}/capacity`)
      .send({ active_capacity: 1 });
    expect(res.status).toBe(200);

    await new Promise(r => setTimeout(r, 200));

    const snapshot = await request(app).get(`/api/pipeline/${job.id}`);
    expect(snapshot.body.data.active).toHaveLength(1);
    expect(snapshot.body.data.waitlist).toHaveLength(2);
  });
});

// ─── Audit Log Tests ──────────────────────────────────────────

describe('GET /api/applications/:id/events', () => {
  it('returns all events for an application', async () => {
    const job = await createJob({ active_capacity: 1 });
    const applyRes = await applyToJob(job.id, 'alice@test.com', 'Alice');
    const appId = applyRes.data.application.id;

    const res = await request(app).get(`/api/applications/${appId}/events`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].event_type).toBe('applied');
  });
});
