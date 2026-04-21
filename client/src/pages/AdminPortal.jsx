import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsApi } from '../api';
import { usePolling } from '../hooks/usePolling';
import { useToast } from '../components/Toast';

export default function AdminPortal() {
  const navigate = useNavigate();
  const addToast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [jobForm, setJobForm] = useState({
    title: '',
    company_name: '',
    description: '',
    active_capacity: 3,
    decay_window_hours: 24,
  });

  const { data: jobs, loading, error, refresh } = usePolling(
    () => jobsApi.list(),
    60000 // 1 minute is fine for high-level list
  );

  async function handleCreateJob(e) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const res = await jobsApi.create({
        ...jobForm,
        active_capacity: Number(jobForm.active_capacity),
        decay_window_hours: Number(jobForm.decay_window_hours),
      });
      addToast(`Job "${res.data.title}" created!`, 'success');
      setShowCreate(false);
      setJobForm({ title: '', company_name: '', description: '', active_capacity: 3, decay_window_hours: 24 });
      refresh();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  if (loading && !jobs) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>Loading pipelines…</span>
      </div>
    );
  }

  return (
    <main className="page" id="admin-portal-page">
      <div className="container">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
          <div>
            <h1 className="page-title">Recruiter Dashboard</h1>
            <p className="page-subtitle">Monitor and manage all active hiring pipelines.</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button 
              className={`btn btn-secondary ${loading ? 'spinning' : ''}`} 
              onClick={async () => { await refresh(); addToast('Pipelines refreshed', 'success'); }}
              disabled={loading}
            >
              ↻ Refresh
            </button>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Create Opening</button>
          </div>
        </header>

        {error && <div className="form-error" style={{ marginBottom: 20 }}>{error}</div>}

        {!loading && (!jobs || jobs.length === 0) ? (
          <div className="empty-state card">
            <div className="empty-state-icon">🏢</div>
            <div className="empty-state-text">No pipelines created yet.</div>
            <button className="btn btn-primary" onClick={() => navigate('/jobs')}>Create First Job</button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Job Title</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Active Usage</th>
                  <th>Waitlist</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(jobs || []).map(job => {
                  const used = parseInt(job.active_count, 10);
                  const capacity = job.active_capacity;
                  const waitlist = parseInt(job.waitlist_count, 10);
                  const isFull = used >= capacity;

                  return (
                    <tr key={job.id} id={`admin-job-row-${job.id}`}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{job.title}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{job.id}</div>
                      </td>
                      <td>{job.company_name}</td>
                      <td>
                        <span style={{
                          fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4,
                          background: job.status === 'open' ? 'var(--color-active-soft)' : 'var(--color-surface-3)',
                          color: job.status === 'open' ? 'var(--color-active)' : 'var(--text-muted)',
                          fontWeight: 700, textTransform: 'uppercase',
                        }}>{job.status}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="capacity-bar" style={{ width: 80, height: 6 }}>
                            <div 
                              className={`capacity-bar-fill ${isFull ? 'full' : ''}`} 
                              style={{ width: `${Math.min(100, (used/capacity)*100)}%` }} 
                            />
                          </div>
                          <span style={{ fontSize: '0.8rem' }}>{used} / {capacity}</span>
                        </div>
                      </td>
                      <td>
                        {waitlist > 0 ? (
                          <span className="badge amber" style={{ borderRadius: 100, padding: '2px 8px', fontSize: '0.75rem' }}>
                            {waitlist} waiting
                          </span>
                        ) : <span style={{ color: 'var(--text-muted)' }}>Empty</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className="btn btn-primary btn-sm"
                          onClick={() => navigate(`/admin/pipeline/${job.id}`)}
                          id={`btn-manage-${job.id}`}
                        >
                          Manage Pipeline →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Create Job Modal ─────────────────────── */}
      {showCreate && (
        <div className="modal-overlay" id="modal-create-job" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-create-title">
            <h2 className="modal-title" id="modal-create-title">Create Job Opening</h2>
            <form onSubmit={handleCreateJob} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="create-title">Job Title *</label>
                  <input
                    id="create-title"
                    className="form-input"
                    placeholder="e.g. Senior Backend Engineer"
                    value={jobForm.title}
                    onChange={e => setJobForm(p => ({ ...p, title: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="create-company">Company *</label>
                  <input
                    id="create-company"
                    className="form-input"
                    placeholder="e.g. Acme Corp"
                    value={jobForm.company_name}
                    onChange={e => setJobForm(p => ({ ...p, company_name: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="create-description">Description</label>
                <textarea
                  id="create-description"
                  className="form-textarea"
                  placeholder="What does the role involve?"
                  value={jobForm.description}
                  onChange={e => setJobForm(p => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="create-capacity">Active Capacity *</label>
                  <input
                    id="create-capacity"
                    type="number"
                    min="1"
                    className="form-input"
                    value={jobForm.active_capacity}
                    onChange={e => setJobForm(p => ({ ...p, active_capacity: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="create-decay">Decay Window (hrs) *</label>
                  <input
                    id="create-decay"
                    type="number"
                    min="1"
                    className="form-input"
                    value={jobForm.decay_window_hours}
                    onChange={e => setJobForm(p => ({ ...p, decay_window_hours: e.target.value }))}
                    required
                  />
                </div>
              </div>
              {createError && <div className="form-error" role="alert">{createError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" id="btn-create-submit" disabled={creating}>
                  {creating ? 'Creating…' : '+ Create Pipeline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
