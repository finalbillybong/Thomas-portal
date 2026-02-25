import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { logAuditEvent } from '../lib/auditLog';
import { useState } from 'react';

export function Layout() {
  const { user, profile, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const isSettings = location.pathname.startsWith('/settings');
  const isHomework = location.pathname === '/homework';

  async function handleLogout() {
    if (user && profile) {
      await logAuditEvent(user.uid, profile.auditEnabled, 'LOGOUT');
    }
    await logout();
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <Link to="/" className="app-title">
          Homework Hub
        </Link>
        <div className="header-actions">
          <button
            className="btn btn-icon"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
          >
            &#9776;
          </button>
          {menuOpen && (
            <div className="dropdown-menu">
              {!isHomework && (
                <Link
                  to="/homework"
                  onClick={() => setMenuOpen(false)}
                  className="dropdown-item"
                >
                  Homework
                </Link>
              )}
              {!isSettings && (
                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="dropdown-item"
                >
                  Settings
                </Link>
              )}
              <Link
                to="/about"
                onClick={() => setMenuOpen(false)}
                className="dropdown-item"
              >
                About
              </Link>
              <button onClick={handleLogout} className="dropdown-item">
                Log out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
