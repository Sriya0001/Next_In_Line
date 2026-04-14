import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');

  return (
    <nav className="navbar" style={{
      height: 64, borderBottom: '1px solid var(--color-border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(10, 10, 12, 0.8)', backdropFilter: 'blur(12px)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        <Link to="/" style={{ 
          display: 'flex', alignItems: 'center', gap: 10, 
          textDecoration: 'none', color: 'var(--text-primary)', fontWeight: 800,
          fontSize: '1.2rem', letterSpacing: '-0.02em'
        }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--color-accent)' }} />
          <span>Next In Line</span>
        </Link>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <NavLink to="/jobs" active={location.pathname === '/jobs'}>Careers</NavLink>
          <NavLink to="/status" active={location.pathname.startsWith('/status')}>My Status</NavLink>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Link 
          to="/admin" 
          className={`btn ${isAdminPath ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          id="nav-admin-portal"
        >
          {isAdminPath ? 'Dashboard Active' : 'Recruiter Portal'}
        </Link>
      </div>
    </nav>
  );
}

function NavLink({ to, children, active }) {
  return (
    <Link to={to} style={{
      textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500,
      color: active ? 'var(--color-accent)' : 'var(--text-secondary)',
      transition: 'color 0.2s ease'
    }}>
      {children}
    </Link>
  );
}
