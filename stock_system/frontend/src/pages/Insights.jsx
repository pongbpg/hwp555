import { useEffect, useState } from 'react';
import api from '../api.js';

export default function Insights() {
  const [data, setData] = useState({ lowStock: [], nearExpiry: [], fastMovers: [], reorderSuggestions: [] });
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await api.get('/inventory/insights');
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>สรุปสต็อก</h2>
        <button className="button secondary" onClick={load}>
          โหลดใหม่
        </button>
      </div>
      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      <Section
        title="สต็อกต่ำ"
        rows={data.lowStock}
        columns={[
          ['productName', 'สินค้า'],
          ['sku', 'รหัสสินค้า'],
          ['stockOnHand', 'คงเหลือ'],
          ['reorderPoint', 'จุดสั่งซื้อ'],
          ['reorderQty', 'จำนวนสั่งซื้อ'],
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
          ['quantitySold', 'ขายแล้ว (30 วัน)'],
        ]}
      />
      <Section
        title="แนะนำการสั่งซื้อเพิ่ม"
        rows={data.reorderSuggestions}
        columns={[
          ['productName', 'สินค้า'],
          ['sku', 'รหัสสินค้า'],
          ['recommendedOrderQty', 'จำนวนแนะนำ'],
          ['leadTimeDays', 'ระยะเวลารอ (วัน)'],
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
