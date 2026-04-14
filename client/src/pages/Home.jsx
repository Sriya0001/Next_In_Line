import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <main className="page" id="home-page">
      <section className="container" style={{ 
        minHeight: '80vh', display: 'flex', flexDirection: 'column', 
        justifyContent: 'center', alignItems: 'center', textAlign: 'center' 
      }}>
        <div style={{
          padding: '6px 16px', borderRadius: 100,
          background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.25)',
          fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-accent)',
          marginBottom: 24, letterSpacing: '0.04em',
        }}>
          Personnel Pipeline Automation
        </div>
        
        <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', lineHeight: 1.1, marginBottom: 24, maxWidth: 800 }}>
          Hiring that moves <span style={{ color: 'var(--color-accent)' }}>without you.</span>
        </h1>
        
        <p style={{ color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto 48px', fontSize: '1.1rem', lineHeight: 1.6 }}>
          Next In Line manages your recruitment throughput automatically. 
          Define capacity, set acknowledgement windows, and let the system handle the queue.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button 
            className="btn btn-primary btn-lg" 
            style={{ minWidth: 200 }}
            onClick={() => navigate('/jobs')}
            id="link-careers"
          >
            Find a Job →
          </button>
          <button 
            className="btn btn-secondary btn-lg" 
            style={{ minWidth: 200 }}
            onClick={() => navigate('/admin')}
            id="link-admin"
          >
            Manage Talent
          </button>
        </div>

        <div style={{ marginTop: 48, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          <button 
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => navigate('/status')}
            id="link-status-lookup"
          >
            Check your application status
          </button>
        </div>
      </section>
    </main>
  );
}
