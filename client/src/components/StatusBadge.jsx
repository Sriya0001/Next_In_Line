/**
 * StatusBadge — maps application status to visual badge.
 */
const STATUS_MAP = {
  active:       { label: 'Active',       cls: 'badge-active' },
  acknowledged: { label: 'Confirmed',    cls: 'badge-acknowledged' },
  waitlisted:   { label: 'Waitlisted',  cls: 'badge-waitlisted' },
  rejected:     { label: 'Rejected',    cls: 'badge-rejected' },
  withdrawn:    { label: 'Withdrawn',   cls: 'badge-withdrawn' },
  decayed:      { label: 'Decayed',     cls: 'badge-decayed' },
};

export default function StatusBadge({ status }) {
  const config = STATUS_MAP[status] || { label: status, cls: '' };
  return (
    <span className={`badge ${config.cls}`} aria-label={`Status: ${config.label}`}>
      {config.label}
    </span>
  );
}
