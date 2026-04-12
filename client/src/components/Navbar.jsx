import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const location = useLocation();

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand" id="nav-brand">
          <div className="brand-icon" aria-hidden="true">⚡</div>
          <span>Next In Line</span>
        </Link>
        <div className="navbar-links">
          <Link
            to="/"
            className={`navbar-link ${location.pathname === '/' ? 'active' : ''}`}
            id="nav-link-home"
          >
            Home
          </Link>
          <a
            href="https://github.com/sriya/next-in-line"
            className="navbar-link"
            target="_blank"
            rel="noopener noreferrer"
            id="nav-link-github"
          >
            GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}
