import { Outlet, NavLink, Link } from 'react-router-dom';

export function SettingsLayout() {
  return (
    <div className="settings-layout">
      <div className="settings-nav">
        <NavLink to="/settings" end className="settings-nav-link">
          General
        </NavLink>
        <NavLink to="/settings/portals" className="settings-nav-link">
          Portals
        </NavLink>
        <NavLink to="/settings/security" className="settings-nav-link">
          Security
        </NavLink>
        <NavLink to="/settings/audit" className="settings-nav-link">
          Audit Log
        </NavLink>
      </div>
      <div className="settings-content">
        <Outlet />
      </div>
      <Link to="/" className="btn btn-ghost settings-back">
        Back to Dashboard
      </Link>
    </div>
  );
}
