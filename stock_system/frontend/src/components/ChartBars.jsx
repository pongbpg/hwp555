import React from 'react';

export default function ChartBars({ title, items, labelKey, valueKey, secondaryValueKey, maxBars = 10 }) {
  const sliced = (items || []).slice(0, maxBars);
  const maxVal = Math.max(...sliced.map((it) => Number(it[valueKey]) || 0), 1);

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <div>
        {sliced.map((it, idx) => {
          const val = Number(it[valueKey]) || 0;
          const pct = Math.round((val / maxVal) * 100);
          const days = secondaryValueKey ? (Number(it[secondaryValueKey]) || 0) : null;
          const color = days != null ? (days < 7 ? '#ef4444' : days < 14 ? '#f59e0b' : '#10b981') : '#3b82f6';
          return (
            <div key={idx} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{it[labelKey]}</div>
                <div style={{ fontSize: '0.75rem', color: '#555' }}>
                  {valueKey}: {val}
                  {days != null && ` • days: ${days}`}
                </div>
              </div>
              <div style={{ background: '#e5e7eb', borderRadius: 6, height: 16, position: 'relative' }}>
                <div
                  style={{ width: `${pct}%`, background: color, height: 16, borderRadius: 6 }}
                  title={`${it[labelKey]} • ${valueKey}: ${val}${days != null ? ` • days: ${days}` : ''}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
