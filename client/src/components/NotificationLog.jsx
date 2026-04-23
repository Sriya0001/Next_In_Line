import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../api';

const ICONS = {
  application_received: '📥',
  promotion_notice: '⚡',
  acknowledgement_confirmed: '✅',
  decay_notice: '🔥',
  rejection_notice: '❌',
  withdrawal_confirmed: '🚪',
};

export default function NotificationLog({ jobId = null }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.getNotifications(jobId ? { job_id: jobId } : {});
      setNotifications(res.data || []);
      setError('');
    } catch (err) {
      setError('Failed to load notifications: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  if (loading && notifications.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading notification log...
      </div>
    );
  }

  if (error) {
    return <div className="form-error">{error}</div>;
  }

  if (notifications.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📭</div>
        <div className="empty-state-text">No simulated emails sent yet.</div>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table style={{ minWidth: 800 }}>
        <thead>
          <tr>
            <th>Time</th>
            <th>Type</th>
            <th>Recipient</th>
            <th>Subject</th>
          </tr>
        </thead>
        <tbody>
          {notifications.map(n => (
            <tr key={n.id}>
              <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {new Date(n.sent_at).toLocaleString()}
              </td>
              <td>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: '0.75rem', padding: '2px 8px', borderRadius: 4,
                  background: 'var(--color-surface-3)', fontWeight: 600,
                  textTransform: 'uppercase'
                }}>
                  {ICONS[n.notification_type] || '📧'} {n.notification_type.replace('_', ' ')}
                </span>
              </td>
              <td>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{n.applicant_name}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{n.applicant_email}</div>
              </td>
              <td>
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{n.subject}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.body}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
