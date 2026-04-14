import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsApi } from '../api';
import { useToast } from '../components/Toast';
import { usePolling } from '../hooks/usePolling';

// ─── Animated hero background ─────────────────────────────────
const GRADIENT_STYLE = {
  background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(108,99,255,0.25) 0%, transparent 70%)',
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
};

export default function CareerPortal() {
  const navigate = useNavigate();
  const addToast = useToast();

  // Job list
  const { data: jobs, loading, refresh } = usePolling(() => jobsApi.list(), 30000, []);

  // ─── Apply Form ─────────────────────────────────────────────
  const [showApply, setShowApply] = useState(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applyResult, setApplyResult] = useState(null);
  const [applyForm, setApplyForm] = useState({ name: '', email: '' });

  async function handleApply(e) {
    e.preventDefault();
    setApplying(true);
    setApplyError('');
    try {
      const res = await jobsApi.apply(showApply.id, applyForm);
      setApplyResult(res.data);
      addToast('Application submitted!', 'success');
    } catch (err) {
      setApplyError(err.message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <main className="page" id="career-portal-page">
      {/* Hero */}
      <section style={{ position: 'relative', textAlign: 'center', padding: '64px 24px 48px' }}>
        <div style={GRADIENT_STYLE} aria-hidden="true" />
        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 16px', borderRadius: 100,
            background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.25)',
            fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-accent)',
            marginBottom: 24, letterSpacing: '0.04em',
          }}>
            Future-proof your hiring journey
          </div>
          <h1 className="page-title" style={{ fontSize: '3rem', maxWidth: 640, margin: '0 auto 16px' }}>
            Open Positions
          </h1>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto 36px', fontSize: '1rem' }}>
            Browse our current openings. All pipelines are automated and transparent.
            Join a queue and watch your status in real-time.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/status')}
              id="btn-nav-status"
            >
              Track Application Status →
            </button>
          </div>
        </div>
      </section>

      {/* Feature chips */}
      <section className="container" style={{ marginBottom: 48 }}>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center',
        }}>
          {[
            { text: 'Transparent Queue' },
            { text: 'Auto-Promotions' },
            { text: 'Fair Waitlisting' },
            { text: 'Live Status Tracking' },
          ].map(f => (
            <div key={f.text} style={{
              padding: '8px 16px', borderRadius: 100,
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              fontSize: '0.8rem', color: 'var(--text-secondary)',
            }}>
              {f.text}
            </div>
          ))}
        </div>
      </section>

      {/* Job listings */}
      <section className="container" id="job-listings">
        <div className="section-header">
          <h2 className="section-title" style={{ visibility: 'hidden' }}>Hidden</h2>
          <button className="btn btn-secondary btn-sm" onClick={refresh} id="btn-refresh-jobs">
            ↻ Refresh
          </button>
        </div>

        {loading && (
          <div className="loading-screen" style={{ minHeight: 200 }}>
            <div className="spinner" />
            <span>Loading jobs…</span>
          </div>
        )}

        {!loading && (!jobs || jobs.length === 0) && (
          <div className="empty-state">
            <div className="empty-state-text">No job openings yet. Check back soon!</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(jobs || []).map(job => {
            const used = parseInt(job.active_count, 10);
            const pct = Math.min(100, (used / job.active_capacity) * 100);
            const isFull = used >= job.active_capacity;

            return (
              <div key={job.id} className="card" id={`job-card-${job.id}`}>
                <div className="flex items-center justify-between gap-4" style={{ flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-3 mb-4" style={{ marginBottom: 8 }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{job.title}</h3>
                      <span style={{
                        fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4,
                        background: job.status === 'open' ? 'var(--color-active-soft)' : 'var(--color-surface-3)',
                        color: job.status === 'open' ? 'var(--color-active)' : 'var(--text-muted)',
                        fontWeight: 600, textTransform: 'uppercase',
                      }}>{job.status}</span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                      {job.company_name}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {job.status === 'open' ? (
                      <button
                        className="btn btn-primary"
                        id={`btn-apply-${job.id}`}
                        onClick={() => { setShowApply(job); setApplyResult(null); setApplyForm({ name: '', email: '' }); setApplyError(''); }}
                      >
                        Apply for Position
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Applications {job.status}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Apply Modal ──────────────────────────── */}
      {showApply && (
        <div className="modal-overlay" id="modal-apply" onClick={e => e.target === e.currentTarget && !applyResult && setShowApply(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-apply-title">
            {applyResult ? (
              /* Success state */
              <div style={{ textAlign: 'center' }}>
                <h2 className="modal-title" id="modal-apply-title">
                  {applyResult.application.status === 'active' ? 'Application Activated' : 'Added to Waitlist'}
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
                  {applyResult.message}
                </p>
                <div style={{
                  padding: '12px 16px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)',
                  marginBottom: 20, fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                }}>
                  Application ID: <strong style={{ color: 'var(--text-primary)' }}>{applyResult.application.id}</strong>
                </div>
                <div className="modal-actions" style={{ justifyContent: 'center' }}>
                  <button
                    className="btn btn-primary"
                    id="btn-view-status"
                    onClick={() => navigate(`/status/${applyResult.application.id}`)}
                  >
                    View Status →
                  </button>
                  <button className="btn btn-secondary" onClick={() => setShowApply(null)}>Close</button>
                </div>
              </div>
            ) : (
              /* Apply form */
              <>
                <h2 className="modal-title" id="modal-apply-title">Apply — {showApply.title}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 20 }}>
                  {showApply.company_name} ·{' '}
                  {parseInt(showApply.active_count, 10) < showApply.active_capacity
                    ? `${showApply.active_capacity - parseInt(showApply.active_count, 10)} slot(s) available`
                    : 'Pipeline full — you\'ll join the waitlist'}
                </p>
                <form onSubmit={handleApply} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="apply-name">Full Name *</label>
                    <input
                      id="apply-name"
                      className="form-input"
                      placeholder="Jane Smith"
                      value={applyForm.name}
                      onChange={e => setApplyForm(p => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="apply-email">Email *</label>
                    <input
                      id="apply-email"
                      type="email"
                      className="form-input"
                      placeholder="jane@example.com"
                      value={applyForm.email}
                      onChange={e => setApplyForm(p => ({ ...p, email: e.target.value }))}
                      required
                    />
                  </div>
                  {applyError && <div className="form-error" role="alert">{applyError}</div>}
                  <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowApply(null)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" id="btn-apply-submit" disabled={applying}>
                      {applying ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Submitting…</> : 'Submit Application'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
