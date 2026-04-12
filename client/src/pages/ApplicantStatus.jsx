import { useParams } from 'react-router-dom';
import { applicationsApi } from '../api';
import { usePolling, useAsyncAction } from '../hooks/usePolling';
import { useToast } from '../components/Toast';
import StatusBadge from '../components/StatusBadge';
import CountdownTimer from '../components/CountdownTimer';
import EventFeed from '../components/EventFeed';
import Avatar from '../components/Avatar';

const STATUS_DESCRIPTIONS = {
  active: 'You\'ve been promoted to active review! Acknowledge your spot before the deadline — or you\'ll be moved back in the queue.',
  acknowledged: 'Your spot is confirmed. The team will review your application.',
  waitlisted: 'You\'re in the queue. You\'ll be auto-promoted when a slot becomes available.',
  rejected: 'Your application was not selected for this role.',
  withdrawn: 'You\'ve withdrawn from this position.',
  decayed: 'You missed the acknowledgement deadline and were re-queued with a penalty.',
};

const STATUS_ICONS = {
  active: '⚡',
  acknowledged: '✅',
  waitlisted: '📋',
  rejected: '❌',
  withdrawn: '🚪',
  decayed: '🔄',
};

export default function ApplicantStatus() {
  const { applicationId } = useParams();
  const addToast = useToast();

  const { data: app, loading, error, lastUpdated, refresh } = usePolling(
    () => applicationsApi.get(applicationId),
    30000,
    [applicationId]
  );

  const { data: events, refresh: refreshEvents } = usePolling(
    () => applicationsApi.getEvents(applicationId),
    30000,
    [applicationId]
  );

  const { loading: ackLoading, execute } = useAsyncAction();

  async function handleAcknowledge() {
    await execute(
      () => applicationsApi.acknowledge(applicationId),
      () => {
        addToast('🎉 Acknowledged! Your spot is now confirmed.', 'success');
        refresh();
        refreshEvents();
      }
    );
  }

  async function handleWithdraw() {
    if (!window.confirm('Are you sure you want to withdraw your application?')) return;
    await execute(
      () => applicationsApi.exit(applicationId, 'withdrawn'),
      () => {
        addToast('Application withdrawn.', 'info');
        refresh();
      }
    );
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>Loading your application…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page container" style={{ maxWidth: 600, margin: '80px auto' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
          <p style={{ color: 'var(--color-danger)' }}>{error}</p>
          <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={refresh}>Retry</button>
        </div>
      </div>
    );
  }

  if (!app) return null;

  const isActive = app.status === 'active';
  const isWaitlisted = app.status === 'waitlisted';
  const isExited = ['rejected', 'withdrawn'].includes(app.status);
  const isOverdue = isActive && app.acknowledge_deadline && new Date(app.acknowledge_deadline) < new Date();

  return (
    <main className="page" id="applicant-status-page">
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 24px' }}>

        {/* Header card */}
        <div className="glass-card" style={{ marginBottom: 20, textAlign: 'center', padding: '40px 32px' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>
            {STATUS_ICONS[app.status] || '📋'}
          </div>
          <Avatar name={app.name} size={56} />
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 12, marginBottom: 4 }}>
            {app.name}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 16 }}>
            {app.email}
          </p>
          <StatusBadge status={app.status} />
          <p style={{ color: 'var(--text-secondary)', marginTop: 16, maxWidth: 380, margin: '16px auto 0', fontSize: '0.9rem' }}>
            {STATUS_DESCRIPTIONS[app.status]}
          </p>
        </div>

        {/* Job details */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title" style={{ marginBottom: 12 }}>Application Details</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.875rem' }}>
            <Row label="Role" value={app.job_title} />
            <Row label="Company" value={app.company_name} />
            <Row label="Applied" value={new Date(app.applied_at).toLocaleString()} />
            <Row label="Application ID" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{app.id}</span>} />
            {isWaitlisted && (
              <>
                <Row label="Queue Position" value={<strong style={{ color: 'var(--color-waitlist)' }}>#{app.waitlist_position}</strong>} />
                {app.ahead_count !== null && (
                  <Row label="Ahead of you" value={`${app.ahead_count} applicant${app.ahead_count !== 1 ? 's' : ''}`} />
                )}
              </>
            )}
            {app.decay_penalty_count > 0 && (
              <Row label="Decay Penalties" value={<span style={{ color: 'var(--color-decay)' }}>🔥 ×{app.decay_penalty_count}</span>} />
            )}
          </div>
        </div>

        {/* Acknowledge deadline */}
        {isActive && app.acknowledge_deadline && (
          <div className={`card ${isOverdue ? '' : ''}`} style={{
            marginBottom: 16,
            borderColor: isOverdue ? 'rgba(249,115,22,0.4)' : undefined,
            background: isOverdue ? 'rgba(249,115,22,0.04)' : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 4 }}>
                  {isOverdue ? '⚠️ Deadline Passed' : '⏱ Acknowledge by'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {new Date(app.acknowledge_deadline).toLocaleString()}
                </div>
              </div>
              <CountdownTimer deadlineISO={app.acknowledge_deadline} />
            </div>
          </div>
        )}

        {/* Actions */}
        {!isExited && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {isActive && (
              <button
                className="btn btn-success"
                id="btn-acknowledge"
                onClick={handleAcknowledge}
                disabled={ackLoading}
                style={{ flex: 1 }}
              >
                {ackLoading
                  ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Confirming…</>
                  : '✅ Acknowledge My Spot'}
              </button>
            )}
            <button
              className="btn btn-secondary"
              id="btn-withdraw"
              onClick={handleWithdraw}
              disabled={ackLoading}
              style={{ flex: isActive ? 0 : 1 }}
            >
              Withdraw
            </button>
          </div>
        )}

        {/* Polling note */}
        {lastUpdated && (
          <div className="refresh-bar" style={{ justifyContent: 'center', marginBottom: 20 }}>
            <div className="refresh-dot" />
            <span>Auto-refreshes every 30s · Last: {lastUpdated.toLocaleTimeString()}</span>
          </div>
        )}

        {/* Event trail */}
        <div className="card">
          <div className="section-header">
            <h2 className="section-title">Your Journey</h2>
          </div>
          <EventFeed events={events || []} showApplicant={false} />
        </div>

      </div>
    </main>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
