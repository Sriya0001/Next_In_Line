import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { applicationsApi } from '../api';
import { useAsyncAction } from '../hooks/usePolling';
import StatusBadge from '../components/StatusBadge';

export default function StatusLookup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [appId, setAppId] = useState('');
  const [results, setResults] = useState(null);
  const { loading, error, execute } = useAsyncAction();

  async function handleIdLookup(e) {
    e.preventDefault();
    if (!appId.trim()) return;
    navigate(`/status/${appId.trim()}`);
  }

  async function handleEmailLookup(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setResults(null);
    await execute(
      () => applicationsApi.lookup(email.trim()),
      (res) => setResults(res.data)
    );
  }

  return (
    <main className="page" id="status-lookup-page">
      <div className="container" style={{ maxWidth: 640, margin: '40px auto' }}>
        <h1 className="page-title">Track Application</h1>
        <p className="page-subtitle" style={{ marginBottom: 32 }}>
          Enter your Application ID or Email to check your current position in the pipeline.
        </p>

        <div className="grid-2" style={{ gap: 24 }}>
          {/* ID Lookup */}
          <section className="card">
            <h2 className="section-title" style={{ fontSize: '1rem', marginBottom: 16 }}>Lookup by ID</h2>
            <form onSubmit={handleIdLookup}>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label" htmlFor="lookup-id">Application ID</label>
                <input
                  id="lookup-id"
                  className="form-input"
                  placeholder="e.g. uuid-..."
                  value={appId}
                  onChange={e => setAppId(e.target.value)}
                />
              </div>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%' }}
                id="btn-lookup-id"
              >
                Track ID →
              </button>
            </form>
          </section>

          {/* Email Lookup */}
          <section className="card">
            <h2 className="section-title" style={{ fontSize: '1rem', marginBottom: 16 }}>Lookup by Email</h2>
            <form onSubmit={handleEmailLookup}>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label" htmlFor="lookup-email">Email Address</label>
                <input
                  id="lookup-email"
                  type="email"
                  className="form-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <button 
                type="submit" 
                className="btn btn-secondary" 
                style={{ width: '100%' }}
                disabled={loading}
                id="btn-lookup-email"
              >
                {loading ? 'Searching...' : 'Find Applications'}
              </button>
            </form>
          </section>
        </div>

        {error && (
          <div className="form-error" style={{ marginTop: 20, textAlign: 'center' }}>
            {error}
          </div>
        )}

        {/* Results */}
        {results && (
          <section style={{ marginTop: 40 }}>
            <h2 className="section-title" style={{ marginBottom: 20 }}>
              Found {results.length} application{results.length !== 1 ? 's' : ''}
            </h2>
            {results.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-text">No active applications found for this email.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {results.map(app => (
                  <div key={app.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{app.job_title}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{app.company_name}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <StatusBadge status={app.status} />
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => navigate(`/status/${app.id}`)}
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
