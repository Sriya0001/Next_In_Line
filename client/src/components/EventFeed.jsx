const EVENT_LABELS = {
  applied:          { label: 'Applied',               color: '#6c63ff' },
  activated:        { label: 'Activated',              color: '#10b981' },
  waitlisted:       { label: 'Added to Waitlist',     color: '#f59e0b' },
  promoted:         { label: 'Promoted to Active',    color: '#10b981' },
  acknowledged:     { label: 'Acknowledged',           color: '#3b82f6' },
  rejected:         { label: 'Rejected',               color: '#ef4444' },
  withdrawn:        { label: 'Withdrew',               color: '#9399a6' },
  decayed:          { label: 'Missed Deadline',        color: '#f97316' },
  requeued:         { label: 'Re-queued (Penalized)',  color: '#f97316' },
  capacity_changed: { label: 'Capacity Changed',       color: '#6c63ff' },
  job_status_changed: { label: 'Job Status Changed',  color: '#6c63ff' },
};

function formatRelativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(isoString).toLocaleDateString();
}

export default function EventFeed({ events = [], showApplicant = true }) {
  if (!events.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <div className="empty-state-text">No events yet</div>
      </div>
    );
  }

  return (
    <div className="event-feed" role="log" aria-label="Pipeline event log">
      {events.map((ev) => {
        const config = EVENT_LABELS[ev.event_type] || { label: ev.event_type, color: '#9399a6' };
        return (
          <div key={ev.id} className="event-item">
            <div className={`event-dot ${ev.event_type}`} style={{ background: config.color }} />
            <div className="event-content">
              <div className="event-text">
                {showApplicant && ev.applicant_name && (
                  <strong>{ev.applicant_name}</strong>
                )}
                {showApplicant && ev.applicant_name ? ' — ' : ''}
                {config.label}
                {ev.to_position && ` (position #${ev.to_position})`}
              </div>
              <div className="event-time">{formatRelativeTime(ev.created_at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
