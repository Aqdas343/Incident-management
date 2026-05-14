export default function StatCard({ label, value, color = '#111827', icon }) {
  return (
    <div className="stat-card" style={{ borderTop: `4px solid ${color}` }}>
      <div className="stat-icon" style={{ color }}>{icon}</div>
      <strong className="stat-value">{value ?? '-'}</strong>
      <span className="stat-label">{label}</span>
    </div>
  );
}
