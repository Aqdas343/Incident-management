import { FiBell, FiLogOut } from 'react-icons/fi';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  incident_manager: 'Incident Manager',
  support_engineer: 'Support Engineer',
};

const ROLE_COLORS = {
  super_admin: '#7c3aed',
  incident_manager: '#0284c7',
  support_engineer: '#059669',
};

export default function Navbar({ user, onLogout }) {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <FiBell size={18} />
        Incident Platform
      </div>
      <div className="navbar-right">
        <span className="role-badge" style={{ background: ROLE_COLORS[user?.role] || '#6b7280' }}>
          {ROLE_LABELS[user?.role] || user?.role}
        </span>
        <span className="navbar-email">{user?.email}</span>
        <button className="btn-outline" onClick={onLogout}>
          <FiLogOut size={14} />
          Sign out
        </button>
      </div>
    </nav>
  );
}
