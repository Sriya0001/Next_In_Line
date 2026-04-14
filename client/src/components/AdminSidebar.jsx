import { useNavigate, useParams } from 'react-router-dom';
import { jobsApi } from '../api';
import { usePolling } from '../hooks/usePolling';

export default function AdminSidebar() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const { data: jobs } = usePolling(() => jobsApi.list(), 60000);

  return (
    <aside className="admin-sidebar" style={{
      width: 260, borderRight: '1px solid var(--color-border)',
      height: 'calc(100vh - 64px)', position: 'sticky', top: 64,
      background: 'var(--color-surface-1)', padding: '24px 0',
      overflowY: 'auto', display: 'flex', flexDirection: 'column'
    }}>
      <div style={{ padding: '0 20px 16px', borderBottom: '1px solid var(--color-border)', marginBottom: 16 }}>
        <button 
          className="btn btn-secondary btn-sm" 
          style={{ width: '100%', justifyContent: 'flex-start' }}
          onClick={() => navigate('/admin')}
        >
          ← All Pipelines
        </button>
      </div>

      <div style={{ padding: '0 20px' }}>
        <h3 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Active Jobs
        </h3>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(jobs || []).map(job => (
            <button
              key={job.id}
              onClick={() => navigate(`/admin/pipeline/${job.id}`)}
              style={{
                textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem', border: 'none', cursor: 'pointer',
                background: jobId === job.id ? 'var(--color-active-soft)' : 'transparent',
                color: jobId === job.id ? 'var(--color-active)' : 'var(--text-secondary)',
                fontWeight: jobId === job.id ? 600 : 400,
                transition: 'all 0.2s ease'
              }}
              className="sidebar-link"
            >
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.title}</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>{job.company_name}</div>
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}
