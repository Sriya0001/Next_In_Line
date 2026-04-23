import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { pipelineApi, applicationsApi, jobsApi } from '../api';
import { usePolling, useAsyncAction } from '../hooks/usePolling';
import { useToast } from '../components/Toast';
import StatusBadge from '../components/StatusBadge';
import CountdownTimer from '../components/CountdownTimer';
import EventFeed from '../components/EventFeed';
import Avatar from '../components/Avatar';
import AdminSidebar from '../components/AdminSidebar';
import NotificationLog from '../components/NotificationLog';

const POLL_INTERVAL = 30000; // 30s — deliberate choice for minimal architecture

export default function PipelineView() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const addToast = useToast();

  const [activeTab, setActiveTab] = useState('pipeline');
  const [confirmExit, setConfirmExit] = useState(null);
  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [newCapacity, setNewCapacity] = useState('');
  const [capacityError, setCapacityError] = useState('');

  // Pipeline snapshot (polls every 30s)
  const { data: pipeline, loading, error, lastUpdated, refresh } = usePolling(
    () => pipelineApi.snapshot(jobId),
    POLL_INTERVAL,
    [jobId]
  );

  // Events log (polls every 30s)
  const { data: eventsData, refresh: refreshEvents } = usePolling(
    () => pipelineApi.events(jobId, { limit: 30 }),
    POLL_INTERVAL,
    [jobId]
  );

  const previousActiveRef = useRef();
  useEffect(() => {
    if (pipeline && previousActiveRef.current) {
      const prevActiveIds = new Set(previousActiveRef.current.map(a => a.id));
      const newPromotions = pipeline.active.filter(a => !prevActiveIds.has(a.id));
      
      if (newPromotions.length > 0) {
        newPromotions.forEach(p => {
          addToast(`⚡ Auto-promoted: ${p.name} joined active review!`, 'info');
        });
      }
    }
    if (pipeline) {
      previousActiveRef.current = pipeline.active;
    }
  }, [pipeline, addToast]);

  const { loading: actionLoading, execute } = useAsyncAction();

  async function handleExit(appId, reason) {
    await execute(
      () => applicationsApi.exit(appId, reason),
      () => {
        addToast(reason === 'rejected' ? 'Applicant rejected. Cascade promotion triggered.' : 'Applicant withdrawn.', 'success');
        setConfirmExit(null);
        setTimeout(() => { refresh(); refreshEvents(); }, 500);
      }
    );
  }

  function handleDownloadCSV() {
    if (!eventsData || eventsData.length === 0) {
      addToast('No audit events to download.', 'info');
      return;
    }

    const headers = ['Timestamp', 'Event Type', 'Applicant Name', 'Applicant Email', 'From Status', 'To Status', 'Metadata'];
    const rows = eventsData.map(e => [
      new Date(e.created_at).toISOString(),
      e.event_type,
      e.applicant_name || 'System',
      e.applicant_email || '-',
      e.from_status || '-',
      e.to_status || '-',
      JSON.stringify(e.metadata) || '{}'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `audit_log_${jobId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleCapacityChange(e) {
    e.preventDefault();
    const cap = parseInt(newCapacity, 10);
    if (!cap || cap < 1) { setCapacityError('Must be a positive integer'); return; }
    setCapacityError('');
    await execute(
      () => jobsApi.updateCapacity(jobId, cap),
      () => {
        addToast('Capacity updated — pipeline adjusted automatically.', 'success');
        setShowCapacityModal(false);
        setNewCapacity('');
        setTimeout(() => { refresh(); refreshEvents(); }, 600);
      }
    );
  }

  async function handleStatusChange(status) {
    await execute(
      () => jobsApi.updateStatus(jobId, status),
      () => { addToast(`Job ${status}.`, 'info'); refresh(); }
    );
  }

  // Removed unused handleTriggerDecay

  if (loading && !pipeline) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>Loading pipeline…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page container">
        <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
          <p style={{ color: 'var(--color-danger)' }}>{error}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
            <button className="btn btn-secondary" onClick={refresh}>Retry</button>
            <button className="btn btn-secondary" onClick={() => navigate('/admin')}>← Back</button>
          </div>
        </div>
      </div>
    );
  }

  if (!pipeline) return null;

  const { job, active, waitlist, stats } = pipeline;
  const pct = Math.min(100, (pipeline.capacity_used / pipeline.capacity_total) * 100);
  const isFull = pipeline.capacity_available <= 0;

  return (
    <div style={{ display: 'flex' }}>
      <AdminSidebar />
      <main className="page" id="pipeline-view-page" style={{ flex: 1, paddingLeft: 0 }}>
        <div className="container" style={{ paddingTop: 24 }}>

          {/* ─── Page Header ────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{
                  fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4,
                  background: job.status === 'open' ? 'var(--color-active-soft)' : 'var(--color-surface-3)',
                  color: job.status === 'open' ? 'var(--color-active)' : 'var(--text-muted)',
                  fontWeight: 700, textTransform: 'uppercase',
                }}>{job.status}</span>
              </div>
              <h1 className="page-title" style={{ fontSize: '1.6rem' }}>{job.title}</h1>
              <p className="page-subtitle">{job.company_name} · {job.decay_window_hours}h window</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowCapacityModal(true)} id="btn-capacity">
                ⚙ Capacity ({pipeline.capacity_used}/{pipeline.capacity_total})
              </button>
              {job.status === 'open' ? (
                <button className="btn btn-secondary btn-sm" onClick={() => handleStatusChange('paused')} id="btn-pause">⏸ Pause</button>
              ) : job.status === 'paused' ? (
                <button className="btn btn-success btn-sm" onClick={() => handleStatusChange('open')} id="btn-open">▶ Open</button>
              ) : null}
              <button 
                className={`btn btn-secondary btn-sm ${loading ? 'spinning' : ''}`} 
                onClick={() => { refresh(); refreshEvents(); }} 
                id="btn-refresh"
                disabled={loading}
              >
                ↻
              </button>
            </div>
          </div>

          {/* ─── Stats Strip ────────────────────────── */}
          <div className="stats-grid" style={{ marginBottom: 20 }}>
            <div className="stat-card green">
              <div className="stat-value">{stats.active_count}</div>
              <div className="stat-label">Active</div>
            </div>
            <div className="stat-card amber">
              <div className="stat-value">{stats.waitlist_count}</div>
              <div className="stat-label">Waitlisted</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{pipeline.capacity_available}</div>
              <div className="stat-label">Available</div>
            </div>
            <div className="stat-card red">
              <div className="stat-value">{stats.rejected_count}</div>
              <div className="stat-label">Rejected</div>
            </div>
          </div>

          {/* Capacity bar */}
          <div style={{ marginBottom: 28 }}>
            <div className="capacity-bar" style={{ height: 6 }}>
              <div className={`capacity-bar-fill ${isFull ? 'full' : ''}`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* ─── Tabs ───────────────────────────────── */}
          <div className="tabs" style={{ marginBottom: 20, width: 'fit-content' }}>
            <button className={`tab ${activeTab === 'pipeline' ? 'active' : ''}`} id="tab-pipeline" onClick={() => setActiveTab('pipeline')}>Pipeline</button>
            <button className={`tab ${activeTab === 'waitlist' ? 'active' : ''}`} id="tab-waitlist" onClick={() => setActiveTab('waitlist')}>
              Waitlist{waitlist.length > 0 && ` (${waitlist.length})`}
            </button>
            <button className={`tab ${activeTab === 'events' ? 'active' : ''}`} id="tab-events" onClick={() => setActiveTab('events')}>Audit Log</button>
            <button className={`tab ${activeTab === 'notifications' ? 'active' : ''}`} id="tab-notifications" onClick={() => setActiveTab('notifications')}>Notifications</button>
          </div>

          {/* ─── Pipeline Tab ────────────────────────── */}
          {activeTab === 'pipeline' && (
            <div id="pipeline-tab">
              <div className="section-header">
                <h2 className="section-title">
                  Active Applicants
                  <span className="count">{active.length}</span>
                </h2>
                {lastUpdated && (
                  <div className="refresh-bar">
                    <div className="refresh-dot" />
                    <span>Updated {lastUpdated.toLocaleTimeString()}</span>
                  </div>
                )}
              </div>

              {active.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon">🚀</div>
                  <div className="empty-state-text">No active applicants.</div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {active.map(app => {
                  const isOverdue = app.is_overdue || (app.acknowledge_deadline && new Date(app.acknowledge_deadline) < new Date());
                  return (
                    <div key={app.id} className={`applicant-card ${isOverdue ? 'overdue' : ''}`} id={`active-card-${app.id}`}>
                      <div className="applicant-info">
                        <Avatar name={app.name} />
                        <div style={{ minWidth: 0 }}>
                          <div className="applicant-name">{app.name}</div>
                          <div className="applicant-email">{app.email}</div>
                        </div>
                      </div>
                      <div className="applicant-meta">
                        {app.decay_penalty_count > 0 && (
                          <span className="penalty-indicator" title="Previously decayed">
                            🔥 ×{app.decay_penalty_count}
                          </span>
                        )}
                        <StatusBadge status={app.status} />
                        {app.status === 'acknowledged' && null}
                        {app.status === 'active' && app.acknowledge_deadline && (
                          <CountdownTimer deadlineISO={app.acknowledge_deadline} />
                        )}
                        <button
                          className="btn btn-danger btn-sm"
                          id={`btn-exit-${app.id}`}
                          onClick={() => setConfirmExit({ id: app.id, name: app.name, type: 'rejected' })}
                          disabled={actionLoading}
                          aria-label={`Reject ${app.name}`}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Waitlist Tab ─────────────────────────── */}
          {activeTab === 'waitlist' && (
            <div id="waitlist-tab">
              <div className="section-header">
                <h2 className="section-title">
                  Waitlist
                  <span className="count">{waitlist.length}</span>
                </h2>
              </div>

              {waitlist.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon">✨</div>
                  <div className="empty-state-text">Waitlist is empty.</div>
                </div>
              )}

              {waitlist.length > 0 && (
                <div className="table-wrapper">
                  <table id="waitlist-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Applicant</th>
                        <th>Applied</th>
                        <th>Penalties</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {waitlist.map(app => (
                        <tr key={app.id} id={`waitlist-row-${app.id}`}>
                          <td>
                            <div className={`position-badge ${app.waitlist_position === 1 ? 'top1' : ''}`}>
                              {app.waitlist_position}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <Avatar name={app.name} size={28} />
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{app.name}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{app.email}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                            {new Date(app.applied_at).toLocaleDateString()}
                          </td>
                          <td>
                            {app.decay_penalty_count > 0
                              ? <span className="penalty-indicator">🔥 ×{app.decay_penalty_count}</span>
                              : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>}
                          </td>
                          <td>
                            <button
                              className="btn btn-danger btn-sm"
                              id={`btn-reject-waitlist-${app.id}`}
                              onClick={() => setConfirmExit({ id: app.id, name: app.name, type: 'rejected' })}
                              disabled={actionLoading}
                            >
                              Reject
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ─── Events Tab ───────────────────────────── */}
          {activeTab === 'events' && (
            <div id="events-tab">
              <div className="section-header">
                <h2 className="section-title">Audit Log</h2>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={handleDownloadCSV}>📥 Download (CSV)</button>
                  <button className="btn btn-secondary btn-sm" onClick={refreshEvents}>↻ Refresh</button>
                </div>
              </div>
              <div className="card">
                <EventFeed events={eventsData || []} showApplicant={true} />
              </div>
            </div>
          )}

          {/* ─── Notifications Tab ─────────────────────── */}
          {activeTab === 'notifications' && (
            <div id="notifications-tab">
              <div className="section-header">
                <h2 className="section-title">Automated Communication Log</h2>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  A live trail of all simulated emails sent to candidates.
                </div>
              </div>
              <div className="card">
                <NotificationLog jobId={jobId} />
              </div>
            </div>
          )}
        </div>

        {/* ─── Modals ─────────────────────── */}
        {confirmExit && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmExit(null)}>
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-exit-title">
              <h2 className="modal-title" id="confirm-exit-title">Confirm Rejection</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
                Remove <strong>{confirmExit.name}</strong> from the pipeline?
              </p>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setConfirmExit(null)}>Cancel</button>
                <button
                  className="btn btn-danger"
                  id="btn-confirm-reject"
                  onClick={() => handleExit(confirmExit.id, 'rejected')}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Removing...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showCapacityModal && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCapacityModal(false)}>
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="capacity-modal-title">
              <h2 className="modal-title" id="capacity-modal-title">Update Capacity</h2>
              <form onSubmit={handleCapacityChange}>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label" htmlFor="new-capacity">New Active Capacity</label>
                  <input
                    id="new-capacity"
                    type="number"
                    min="1"
                    className="form-input"
                    value={newCapacity}
                    onChange={e => setNewCapacity(e.target.value)}
                    placeholder={String(pipeline.capacity_total)}
                  />
                </div>
                {capacityError && <div className="form-error" style={{ marginBottom: 12 }}>{capacityError}</div>}
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCapacityModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={actionLoading}>Update</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
