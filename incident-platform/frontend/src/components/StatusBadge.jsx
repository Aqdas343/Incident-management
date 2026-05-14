const COLORS = {
  open: { bg: '#fef2f2', color: '#b91c1c' },
  investigating: { bg: '#fff7ed', color: '#c2410c' },
  resolved: { bg: '#f0fdf4', color: '#15803d' },
  merged: { bg: '#f3f4f6', color: '#6b7280' },
};

export default function StatusBadge({ value }) {
  const s = COLORS[value] || COLORS.open;
  return (
    <span className="badge" style={{ background: s.bg, color: s.color }}>
      {value || 'open'}
    </span>
  );
}
