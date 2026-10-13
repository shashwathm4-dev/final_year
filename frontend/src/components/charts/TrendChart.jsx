/**
 * Minimal SVG line chart. series: [{ name, color, values: number|null[] }]
 * labels: x-axis labels (same length as values). referenceLines: [{ value, label, color }]
 */
export default function TrendChart({ series, labels = [], height = 180, referenceLines = [], unit = '' }) {
  if (!Array.isArray(series) || series.length === 0) return null;

  const W = 560, H = height, pad = { l: 38, r: 12, t: 12, b: 22 };
  const vals = series.flatMap((s) => (Array.isArray(s.values) ? s.values : [])).filter((v) => v != null && isFinite(v));
  if (vals.length === 0) return <div className="empty-hint">Not enough data yet</div>;

  const n = Math.max(...series.map((s) => (Array.isArray(s.values) ? s.values.length : 0)), 2);
  const refVals = Array.isArray(referenceLines) ? referenceLines.filter((r) => r && isFinite(r.value)).map((r) => r.value) : [];
  const all = [...vals, ...refVals];
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const min = Math.floor(rawMin - 5);
  const max = Math.ceil(rawMax + 5);
  const span = Math.max(1, max - min);
  const x = (i) => {
    const v = pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
    return isFinite(v) ? v : pad.l;
  };
  const y = (v) => {
    const result = pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
    return isFinite(result) ? result : pad.t;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="trend-chart" role="img">
      {[0, 0.5, 1].map((t) => {
        const v = min + t * (max - min);
        return (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.08)" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{Math.round(v)}{unit}</text>
          </g>
        );
      })}
      {(Array.isArray(referenceLines) ? referenceLines : []).filter((r) => r && isFinite(r.value)).map((r) => (
        <g key={r.label}>
          <line x1={pad.l} x2={W - pad.r} y1={y(r.value)} y2={y(r.value)} stroke={r.color || '#fbbf24'} strokeDasharray="4 4" />
          <text x={W - pad.r} y={y(r.value) - 3} textAnchor="end" fontSize="10" fill={r.color || '#fbbf24'}>{r.label}</text>
        </g>
      ))}
      {series.map((s) => {
        if (!s || !Array.isArray(s.values)) return null;
        const pts = s.values.map((v, i) => (v == null || !isFinite(v) ? null : [x(i), y(v)])).filter(Boolean);
        if (pts.length === 0) return null;
        return (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth="2" points={pts.map((p) => p.join(',')).join(' ')} />
            {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill={s.color} />)}
          </g>
        );
      })}
      {labels.map((l, i) => (
        (labels.length <= 8 || i % Math.ceil(labels.length / 8) === 0) && (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#64748b">{l || ''}</text>
        )
      ))}
    </svg>
  );
}

