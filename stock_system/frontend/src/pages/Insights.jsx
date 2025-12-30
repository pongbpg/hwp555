import { useEffect, useState } from 'react';
import api from '../api.js';
import ChartBars from '../components/ChartBars.jsx';
import StatCard from '../components/StatCard.jsx';

export default function Insights() {
  const [data, setData] = useState({
    lowStock: [],
    nearExpiry: [],
    fastMovers: [],
    reorderSuggestions: [],
    meta: { days: 30, top: 10, counts: {} },
  });
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-800">📊 สรุปสต็อก</h1>
        <div className="flex gap-3 items-center flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">ช่วงวัน</label>
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Top</label>
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </div>
          <button
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg"
            onClick={load}
          >
            🔄 โหลดใหม่
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">{error}</div>}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="สต็อกต่ำ"
          value={fmtNumber.format(data.meta?.counts?.lowStock || 0)}
          color="red"
        />
        <StatCard
          title="ใกล้หมดอายุ"
          value={fmtNumber.format(data.meta?.counts?.nearExpiry || 0)}
          color="orange"
        />
        <StatCard
          title="ขายดี"
          value={fmtNumber.format(data.meta?.counts?.fastMovers || 0)}
          color="green"
        />
        <StatCard
          title="แนะนำสั่งซื้อ"
          value={fmtNumber.format(data.meta?.counts?.reorderSuggestions || 0)}
          color="blue"
        />
      </div>

      {/* Fast Movers Charts */}
      {data.fastMovers?.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            ขายดี {days} วัน (คงเหลือ / วันจะหมด)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ChartBars
              title={`จำนวนขาย (${days} วัน)`}
              items={data.fastMovers.map((fm) => ({
                label: `${fm.productName} • ${fm.sku}`,
                value: fm.quantitySold,
                daysRemaining: fm.daysRemaining,
              }))}
              labelKey="label"
              valueKey="value"
              secondaryValueKey="daysRemaining"
              maxBars={10}
            />
            <ChartBars
              title="คงคลังปัจจุบัน"
              items={data.fastMovers.map((fm) => ({
                label: `${fm.productName} • ${fm.sku}`,
                value: fm.currentStock,
                daysRemaining: fm.daysRemaining,
              }))}
              labelKey="label"
              valueKey="value"
              secondaryValueKey="daysRemaining"
              maxBars={10}
            />
            <ChartBars
              title="เหลือใช้ได้ (วัน)"
              items={data.fastMovers.map((fm) => ({
                label: `${fm.productName} • ${fm.sku}`,
                value: fm.daysRemaining,
              }))}
              labelKey="label"
              valueKey="value"
              maxBars={10}
            />
          </div>
        </div>
      )}

      {/* Low Stock Section */}
      <Section
        title="🔴 สต็อกต่ำ / ใกล้หมด"
        rows={data.lowStock}
        columns={[
          ['productName', 'สินค้า'],
          ['sku', 'รหัสสินค้า'],
          ['stockOnHand', 'คงเหลือ'],
          ['daysRemaining', 'เหลือใช้ได้ (วัน)'],
          ['leadTimeDays', 'Lead Time (วัน)'],
        ]}
      />

      {/* Near Expiry Section */}
      <Section
        title="🟡 ใกล้หมดอายุ"
        rows={data.nearExpiry}
        columns={[
          ['productName', 'สินค้า'],
          ['sku', 'รหัสสินค้า'],
          ['batchRef', 'ล็อต'],
          ['expiryDate', 'วันหมดอายุ'],
          ['quantity', 'จำนวน'],
        ]}
      />

      {/* Fast Movers Section */}
      <Section
        title="🟢 ขายดี"
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

      {/* Reorder Suggestions Section */}
      <Section
        title={`🔵 แนะนำการสั่งซื้อ (คำนวณจากยอดขาย ${days} วัน)`}
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
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map(([key, label]) => (
                <th key={key} className="text-left py-2 px-3 text-sm font-semibold text-gray-600">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                {columns.map(([key]) => (
                  <td key={key} className="py-2 px-3 text-sm">
                    {String(row[key] ?? '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
