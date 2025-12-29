import { useEffect, useState } from 'react';
import api from '../api.js';
import ChartBars from '../components/ChartBars.jsx';
import StatCard from '../components/StatCard.jsx';

export default function Insights() {
  const [data, setData] = useState({ lowStock: [], nearExpiry: [], fastMovers: [], reorderSuggestions: [], meta: { days: 30, top: 10, counts: {} } });
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [topN, setTopN] = useState(10);
  const fmtNumber = new Intl.NumberFormat('th-TH');

  const load = async () => {
    try {
      const res = await api.get(`/inventory/insights?days=${days}&top=${topN}`);
      setData(res.data || {});
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load insights');
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>สรุปสต็อก</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: '0.875rem' }}>ช่วงวัน</label>
          <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={15}>15</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
            <option value={90}>90</option>
          </select>
          <label style={{ fontSize: '0.875rem' }}>Top</label>
          <select className="input" value={topN} onChange={(e) => setTopN(Number(e.target.value))}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={30}>30</option>
            <option value={50}>50</option>
          </select>
          <button className="button secondary" onClick={load}>
            โหลดใหม่
          </button>
        </div>
      </div>
      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginTop: 12 }}>
        <StatCard title="สต็อกต่ำ" value={fmtNumber.format(data.meta?.counts?.lowStock || 0)} color="#ef4444" />
        <StatCard title="ใกล้หมดอายุ" value={fmtNumber.format(data.meta?.counts?.nearExpiry || 0)} color="#f59e0b" />
        <StatCard title="ขายดี" value={fmtNumber.format(data.meta?.counts?.fastMovers || 0)} color="#10b981" />
        <StatCard title="แนะนำสั่งซื้อ" value={fmtNumber.format(data.meta?.counts?.reorderSuggestions || 0)} color="#3b82f6" />
      </div>

      {/* Fast movers with stock and days remaining */}
      {data.fastMovers?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3>ขายดี {days} วัน (คงเหลือ / วันจะหมด)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
            <ChartBars
              title={`จำนวนขาย (${days} วัน)`}
              items={data.fastMovers.map((fm) => ({ label: `${fm.productName} • ${fm.sku}`, value: fm.quantitySold, daysRemaining: fm.daysRemaining }))}
              labelKey="label"
              valueKey="value"
              secondaryValueKey="daysRemaining"
              maxBars={10}
            />
            <ChartBars
              title="คงคลังปัจจุบัน"
              items={data.fastMovers.map((fm) => ({ label: `${fm.productName} • ${fm.sku}`, value: fm.currentStock, daysRemaining: fm.daysRemaining }))}
              labelKey="label"
              valueKey="value"
              secondaryValueKey="daysRemaining"
              maxBars={10}
            />
            <ChartBars
              title="เหลือใช้ได้ (วัน)"
              items={data.fastMovers.map((fm) => ({ label: `${fm.productName} • ${fm.sku}`, value: fm.daysRemaining }))}
              labelKey="label"
              valueKey="value"
              maxBars={10}
            />
          </div>
        </div>
      )}

      <Section
        title="สต็อกต่ำ / ใกล้หมด"
        rows={data.lowStock}
        columns={[
          ['productName', 'สินค้า'],
          ['sku', 'รหัสสินค้า'],
          ['stockOnHand', 'คงเหลือ'],
          ['daysRemaining', 'เหลือใช้ได้ (วัน)'],
          ['leadTimeDays', 'Lead Time (วัน)'],
        ]}
      />
      <Section
        title="ใกล้หมดอายุ"
        rows={data.nearExpiry}
        columns={[
          ['productName', 'สินค้า'],
          ['sku', 'รหัสสินค้า'],
          ['batchRef', 'ล็อต'],
          ['expiryDate', 'วันหมดอายุ'],
          ['quantity', 'จำนวน'],
        ]}
      />
      <Section
        title="ขายดี"
        rows={data.fastMovers}
        columns={[
          ['productName', 'สินค้า'],
          ['sku', 'รหัสสินค้า'],
          ['quantitySold', `ขายแล้ว (${days} วัน)`],
          ['currentStock', 'คงเหลือ'],
          ['incoming', 'กำลังจะเข้า'],
          ['daysRemaining', 'เหลือใช้ได้ (วัน)'],
        ]}
      />

      <Section
        title={`แนะนำการสั่งซื้อ (คำนวณจากยอดขาย ${days} วัน)`}
        rows={data.reorderSuggestions}
        columns={[
          ['productName', 'สินค้า'],
          ['sku', 'รหัสสินค้า'],
          ['currentStock', 'คงเหลือ'],
          ['incoming', 'กำลังจะเข้า'],
          ['quantitySold', `ขายไป (${days} วัน)`],
          ['dailySalesRate', 'ขาย/วัน'],
          ['daysUntilStockOut', 'เหลือใช้ได้ (วัน)'],
          ['minOrderQty', 'สั่งขั้นต่ำ (Lead+Buffer)'],
          ['recommendedOrderQty', `แนะนำสั่ง (LT+Buffer+${days})`],
          ['leadTimeDays', 'Lead Time (วัน)'],
          ['bufferDays', 'Buffer (วัน)'],
        ]}
      />
    </div>
  );
}

function Section({ title, rows, columns }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <h3>{title}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              {columns.map(([key, label]) => (
                <th key={key}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                {columns.map(([key]) => (
                  <td key={key}>{String(row[key] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
