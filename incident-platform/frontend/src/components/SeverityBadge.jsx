const COLORS = {
  critical: { bg: '#fef2f2', color: '#b91c1c' },
  high: { bg: '#fff7ed', color: '#c2410c' },
  medium: { bg: '#fefce8', color: '#a16207' },
  low: { bg: '#f0fdf4', color: '#15803d' },
  unknown: { bg: '#f3f4f6', color: '#6b7280' },
};

export default function SeverityBadge({ value }) {
  const s = COLORS[value] || COLORS.unknown;
  return (
    <span className="badge" style={{ background: s.bg, color: s.color }}>
      {value || 'unknown'}
    </span>
  );
}
