export default function StatCard({ title, value, subtitle, color = '#0066cc' }) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      padding: 16,
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
    }}>
      <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
        {subtitle && <div style={{ fontSize: '0.75rem', color: '#888' }}>{subtitle}</div>}
      </div>
    </div>
  );
}
