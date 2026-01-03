import { useEffect, useState } from 'react';
import api from '../api.js';

// Horizontal Bar Chart for comparison
const HBarChart = ({ data, title, valueKey = 'value', labelKey = 'label', color = '#3B82F6', showTrend = false }) => {
  if (!data || data.length === 0) return null;
  
  const maxValue = Math.max(...data.map(d => d[valueKey] || 0), 1);
  const fmtNumber = new Intl.NumberFormat('th-TH');
  
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <div className="space-y-3">
        {data.slice(0, 15).map((item, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div className="w-8 text-sm text-gray-400 text-right">#{idx + 1}</div>
            <div className="w-40 text-sm text-gray-700 truncate" title={item[labelKey]}>
              {item[labelKey]}
            </div>
            <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-500"
                style={{ 
                  width: `${maxValue > 0 ? (item[valueKey] / maxValue) * 100 : 0}%`,
                  backgroundColor: color 
                }}
              ></div>
            </div>
            <div className="w-24 text-right text-sm font-medium text-gray-700">
              {fmtNumber.format(item[valueKey])}
            </div>
            {showTrend && item.trend !== undefined && (
              <div className={`w-16 text-right text-xs ${item.trend > 0 ? 'text-green-600' : item.trend < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {item.trend > 0 ? '↑' : item.trend < 0 ? '↓' : '–'} {Math.abs(item.trend || 0).toFixed(1)}%
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Comparison Bar Chart (side by side)
const ComparisonChart = ({ data, title, value1Key, value2Key, label1, label2, labelKey = 'label' }) => {
  if (!data || data.length === 0) return null;
  
  const maxValue = Math.max(...data.flatMap(d => [d[value1Key] || 0, d[value2Key] || 0]), 1);
  const fmtNumber = new Intl.NumberFormat('th-TH');
  
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
      <div className="flex gap-4 text-xs text-gray-500 mb-4">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded"></span> {label1}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded"></span> {label2}</span>
      </div>
      <div className="space-y-4">
        {data.slice(0, 10).map((item, idx) => (
          <div key={idx}>
            <div className="text-sm text-gray-700 mb-1 truncate">{item[labelKey]}</div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded"
                    style={{ width: `${(item[value1Key] / maxValue) * 100}%` }}
                  ></div>
                </div>
                <span className="w-20 text-right text-xs text-gray-600">{fmtNumber.format(item[value1Key] || 0)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                  <div 
                    className="h-full bg-green-500 rounded"
                    style={{ width: `${(item[value2Key] / maxValue) * 100}%` }}
                  ></div>
                </div>
                <span className="w-20 text-right text-xs text-gray-600">{fmtNumber.format(item[value2Key] || 0)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Gauge Chart
const GaugeChart = ({ value, max, title, unit = '', colorRange = ['#EF4444', '#F59E0B', '#10B981'] }) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const angle = (percentage / 100) * 180 - 90;
  
  const getColor = () => {
    if (percentage < 33) return colorRange[0];
    if (percentage < 66) return colorRange[1];
    return colorRange[2];
  };
  
  return (
    <div className="bg-white rounded-xl shadow p-4 text-center">
      <h4 className="text-sm font-medium text-gray-600 mb-2">{title}</h4>
      <div className="relative w-32 h-16 mx-auto overflow-hidden">
        <svg viewBox="0 0 100 50" className="w-full h-full">
          {/* Background arc */}
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#E5E7EB" strokeWidth="8" strokeLinecap="round" />
          {/* Value arc */}
          <path 
            d="M 10 50 A 40 40 0 0 1 90 50" 
            fill="none" 
            stroke={getColor()} 
            strokeWidth="8" 
            strokeLinecap="round"
            strokeDasharray={`${percentage * 1.26} 126`}
          />
          {/* Needle */}
          <line 
            x1="50" y1="50" 
            x2={50 + 30 * Math.cos(angle * Math.PI / 180)} 
            y2={50 + 30 * Math.sin(angle * Math.PI / 180)} 
            stroke="#374151" 
            strokeWidth="2"
          />
          <circle cx="50" cy="50" r="4" fill="#374151" />
        </svg>
      </div>
      <div className="text-xl font-bold text-gray-800">{value.toLocaleString()}{unit}</div>
      <div className="text-xs text-gray-500">จาก {max.toLocaleString()}</div>
    </div>
  );
};

// Heat Map Component
const HeatMap = ({ data, title, xLabels, yLabels }) => {
  if (!data || data.length === 0) return null;
  
  const maxValue = Math.max(...data.flat(), 1);
  
  const getColor = (value) => {
    const intensity = value / maxValue;
    if (intensity === 0) return '#F3F4F6';
    if (intensity < 0.25) return '#DBEAFE';
    if (intensity < 0.5) return '#93C5FD';
    if (intensity < 0.75) return '#3B82F6';
    return '#1D4ED8';
  };
  
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th></th>
              {xLabels.map((label, idx) => (
                <th key={idx} className="px-2 py-1 text-gray-500 font-normal">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => (
              <tr key={rowIdx}>
                <td className="px-2 py-1 text-gray-500 text-right">{yLabels[rowIdx]}</td>
                {row.map((value, colIdx) => (
                  <td key={colIdx} className="px-1 py-1">
                    <div 
                      className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-medium"
                      style={{ backgroundColor: getColor(value) }}
                      title={`${yLabels[rowIdx]} - ${xLabels[colIdx]}: ${value}`}
                    >
                      {value > 0 ? value : ''}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Multi-line trend chart
const TrendChart = ({ data, title, lines }) => {
  if (!data || data.length === 0) return null;
  
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
  const maxValue = Math.max(...data.flatMap(d => lines.map(l => d[l.key] || 0)), 1);
  
  const getPoints = (key) => {
    return data.map((d, idx) => ({
      x: 50 + (idx * (300 / Math.max(data.length - 1, 1))),
      y: 150 - ((d[key] / maxValue) * 120),
      value: d[key] || 0,
      label: d.label
    }));
  };
  
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
      <div className="flex gap-4 text-xs mb-4">
        {lines.map((line, idx) => (
          <span key={idx} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[idx] }}></span>
            {line.label}
          </span>
        ))}
      </div>
      <svg viewBox="0 0 400 170" className="w-full h-40">
        {/* Grid */}
        {[0, 30, 60, 90, 120].map(y => (
          <line key={y} x1="50" y1={30 + y} x2="350" y2={30 + y} stroke="#E5E7EB" strokeWidth="1" />
        ))}
        {/* Lines */}
        {lines.map((line, lineIdx) => {
          const points = getPoints(line.key);
          const pathD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          return (
            <g key={lineIdx}>
              <path d={pathD} fill="none" stroke={colors[lineIdx]} strokeWidth="2" />
              {points.map((p, idx) => (
                <circle key={idx} cx={p.x} cy={p.y} r="3" fill={colors[lineIdx]}>
                  <title>{p.label}: {p.value.toLocaleString()}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {/* X Labels */}
        {data.filter((_, i) => i % Math.ceil(data.length / 7) === 0).map((d, idx) => (
          <text key={idx} x={50 + (idx * Math.ceil(data.length / 7) * (300 / Math.max(data.length - 1, 1)))} y="165" textAnchor="middle" className="text-xs fill-gray-500">{d.label}</text>
        ))}
      </svg>
    </div>
  );
};

// Data Table Component
const DataTable = ({ data, columns, title }) => {
  if (!data || data.length === 0) return null;
  
  const fmtNumber = new Intl.NumberFormat('th-TH');
  
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200">
              {columns.map((col, idx) => (
                <th key={idx} className={`py-2 px-3 font-semibold text-gray-600 ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b border-gray-100 hover:bg-gray-50">
                {columns.map((col, colIdx) => {
                  let value = row[col.key];
                  if (col.format === 'number') value = fmtNumber.format(value || 0);
                  if (col.format === 'percent') value = `${(value || 0).toFixed(1)}%`;
                  if (col.format === 'days') value = value === 999999 ? '∞' : `${Math.round(value || 0)} วัน`;
                  
                  return (
                    <td key={colIdx} className={`py-2 px-3 ${col.align === 'right' ? 'text-right' : ''} ${
                      col.highlight && value < col.highlightThreshold ? 'text-red-600 font-medium' : 'text-gray-700'
                    }`}>
                      {value ?? '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Stat Card with trend
const StatCardTrend = ({ title, value, trend, trendLabel, icon, color = 'blue' }) => {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    red: 'from-red-500 to-red-600',
    amber: 'from-amber-500 to-amber-600',
    purple: 'from-purple-500 to-purple-600',
  };
  
  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-xl shadow-lg p-4 text-white`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm opacity-90">{icon} {title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        {trend !== undefined && (
          <div className={`text-xs px-2 py-1 rounded-full ${trend >= 0 ? 'bg-white/20' : 'bg-red-400/30'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      {trendLabel && <p className="text-xs opacity-75 mt-2">{trendLabel}</p>}
    </div>
  );
};

export default function Insights() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [topN, setTopN] = useState(20);

  const fmtNumber = new Intl.NumberFormat('th-TH');
  const fmtCurrency = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/inventory/insights?days=${days}&top=${topN}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow p-6">
        <p className="text-red-600 mb-4">{error}</p>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg" onClick={load}>
          ลองอีกครั้ง
        </button>
      </div>
    );
  }

  const counts = data?.meta?.counts || {};
  
  // Prepare analysis data
  const fastMoversData = (data?.fastMovers || []).map(fm => ({
    label: `${fm.productName} (${fm.sku})`,
    productName: fm.productName,
    sku: fm.sku,
    quantitySold: fm.quantitySold,
    dailySalesRate: fm.dailySalesRate,
    currentStock: fm.currentStock,
    incoming: fm.incoming,
    daysRemaining: fm.daysRemaining,
    categoryName: fm.categoryName,
    brandName: fm.brandName,
  }));

  const categoryAnalysis = (data?.categorySummaries || []).map(cat => ({
    label: cat.categoryName,
    totalSold: cat.totalSold,
    totalStock: cat.totalStock,
    dailySalesRate: cat.dailySalesRate,
    daysRemaining: cat.daysRemaining,
    turnoverRate: cat.totalStock > 0 ? (cat.totalSold / cat.totalStock * 100) : 0,
  }));

  const brandAnalysis = (data?.brandSummaries || []).map(brand => ({
    label: brand.brandName,
    totalSold: brand.totalSold,
    totalStock: brand.totalStock,
    dailySalesRate: brand.dailySalesRate,
    daysRemaining: brand.daysRemaining,
    turnoverRate: brand.totalStock > 0 ? (brand.totalSold / brand.totalStock * 100) : 0,
  }));

  const reorderData = (data?.reorderSuggestions || []).map(item => ({
    ...item,
    urgency: item.daysUntilStockOut <= 7 ? 'ด่วนมาก' : item.daysUntilStockOut <= 14 ? 'ด่วน' : 'ปกติ',
    urgencyColor: item.daysUntilStockOut <= 7 ? 'bg-red-100 text-red-700' : item.daysUntilStockOut <= 14 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700',
  }));

  const lowStockData = (data?.lowStock || []);
  const nearExpiryData = (data?.nearExpiry || []);

  // Calculate totals
  const totalSold = fastMoversData.reduce((sum, f) => sum + f.quantitySold, 0);
  const avgDailyRate = fastMoversData.reduce((sum, f) => sum + f.dailySalesRate, 0);
  const criticalItems = reorderData.filter(r => r.daysUntilStockOut <= 7).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📈 Insights & Analytics</h1>
          <p className="text-gray-500 text-sm">วิเคราะห์เชิงลึก ({days} วันย้อนหลัง)</p>
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">ช่วงวัน</label>
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={7}>7 วัน</option>
              <option value={15}>15 วัน</option>
              <option value={30}>30 วัน</option>
              <option value={60}>60 วัน</option>
              <option value={90}>90 วัน</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">แสดง</label>
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
            >
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={30}>Top 30</option>
              <option value={50}>Top 50</option>
            </select>
          </div>
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            onClick={load}
          >
            🔄 วิเคราะห์ใหม่
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCardTrend title="ขายทั้งหมด" value={fmtNumber.format(totalSold)} icon="📦" color="blue" trendLabel={`${days} วันที่ผ่านมา`} />
        <StatCardTrend title="ขายเฉลี่ย/วัน" value={fmtNumber.format(Math.round(avgDailyRate))} icon="📊" color="green" trendLabel="ทุกสินค้ารวม" />
        <StatCardTrend title="สินค้าขายดี" value={fmtNumber.format(counts.fastMovers || 0)} icon="🔥" color="purple" />
        <StatCardTrend title="ต้องสั่งเติม" value={fmtNumber.format(counts.reorderSuggestions || 0)} icon="🛒" color="amber" />
        <StatCardTrend title="สต็อกวิกฤต" value={fmtNumber.format(criticalItems)} icon="🚨" color="red" trendLabel="เหลือ < 7 วัน" />
        <StatCardTrend title="ใกล้หมดอายุ" value={fmtNumber.format(counts.nearExpiry || 0)} icon="⏰" color="amber" />
      </div>

      {/* Inventory Health Gauges */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">🏥 Inventory Health</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <GaugeChart 
            value={counts.fastMovers || 0} 
            max={Math.max(50, counts.fastMovers || 0)} 
            title="สินค้าขายดี" 
            colorRange={['#EF4444', '#F59E0B', '#10B981']}
          />
          <GaugeChart 
            value={100 - Math.min(100, (criticalItems / Math.max(counts.reorderSuggestions, 1)) * 100)} 
            max={100} 
            title="Stock Health %" 
            unit="%"
            colorRange={['#EF4444', '#F59E0B', '#10B981']}
          />
          <GaugeChart 
            value={avgDailyRate} 
            max={Math.max(100, avgDailyRate)} 
            title="Velocity/วัน" 
            colorRange={['#3B82F6', '#10B981', '#10B981']}
          />
          <GaugeChart 
            value={Math.max(0, 30 - (counts.nearExpiry || 0))} 
            max={30} 
            title="Expiry Safety" 
            colorRange={['#EF4444', '#F59E0B', '#10B981']}
          />
        </div>
      </div>

      {/* Analysis Section 1: Sales Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HBarChart 
          data={fastMoversData}
          title={`🔥 Top ${topN} สินค้าขายดี (${days} วัน)`}
          valueKey="quantitySold"
          color="#10B981"
        />
        <HBarChart 
          data={fastMoversData.sort((a, b) => b.dailySalesRate - a.dailySalesRate)}
          title="📈 อัตราขายสูงสุด (ต่อวัน)"
          valueKey="dailySalesRate"
          color="#3B82F6"
        />
      </div>

      {/* Analysis Section 2: Stock Days Remaining */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HBarChart 
          data={fastMoversData.filter(f => f.daysRemaining < 999).sort((a, b) => a.daysRemaining - b.daysRemaining)}
          title="⚠️ สินค้าที่เหลือใช้ได้น้อย (วัน)"
          valueKey="daysRemaining"
          color="#F59E0B"
        />
        <ComparisonChart
          data={fastMoversData.slice(0, 10)}
          title="📊 เปรียบเทียบ: ยอดขาย vs คงเหลือ"
          value1Key="quantitySold"
          value2Key="currentStock"
          label1="ขายไป"
          label2="คงเหลือ"
        />
      </div>

      {/* Category & Brand Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DataTable
          data={categoryAnalysis}
          title="📁 วิเคราะห์ตามหมวดหมู่"
          columns={[
            { key: 'label', label: 'หมวดหมู่' },
            { key: 'totalSold', label: 'ขายแล้ว', format: 'number', align: 'right' },
            { key: 'totalStock', label: 'คงเหลือ', format: 'number', align: 'right' },
            { key: 'dailySalesRate', label: '/วัน', format: 'number', align: 'right' },
            { key: 'daysRemaining', label: 'เหลือ', format: 'days', align: 'right', highlight: true, highlightThreshold: 14 },
            { key: 'turnoverRate', label: 'Turnover', format: 'percent', align: 'right' },
          ]}
        />
        <DataTable
          data={brandAnalysis}
          title="🏷️ วิเคราะห์ตามแบรนด์"
          columns={[
            { key: 'label', label: 'แบรนด์' },
            { key: 'totalSold', label: 'ขายแล้ว', format: 'number', align: 'right' },
            { key: 'totalStock', label: 'คงเหลือ', format: 'number', align: 'right' },
            { key: 'dailySalesRate', label: '/วัน', format: 'number', align: 'right' },
            { key: 'daysRemaining', label: 'เหลือ', format: 'days', align: 'right', highlight: true, highlightThreshold: 14 },
            { key: 'turnoverRate', label: 'Turnover', format: 'percent', align: 'right' },
          ]}
        />
      </div>

      {/* Reorder Suggestions - Urgent */}
      {reorderData.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">🛒 แนะนำการสั่งซื้อ</h3>
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 bg-red-100 text-red-700 rounded">ด่วนมาก ≤7 วัน</span>
              <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded">ด่วน ≤14 วัน</span>
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">ปกติ</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="py-2 px-3 text-left font-semibold text-gray-600">ความเร่งด่วน</th>
                  <th className="py-2 px-3 text-left font-semibold text-gray-600">สินค้า</th>
                  <th className="py-2 px-3 text-left font-semibold text-gray-600">SKU</th>
                  <th className="py-2 px-3 text-right font-semibold text-gray-600">คงเหลือ</th>
                  <th className="py-2 px-3 text-right font-semibold text-gray-600">ขาย/วัน</th>
                  <th className="py-2 px-3 text-right font-semibold text-gray-600">เหลือใช้</th>
                  <th className="py-2 px-3 text-right font-semibold text-gray-600">Lead Time</th>
                  <th className="py-2 px-3 text-right font-semibold text-gray-600">จุดสั่งซื้อ</th>
                  <th className="py-2 px-3 text-right font-semibold text-gray-600 bg-blue-50">แนะนำสั่ง</th>
                  <th className="py-2 px-3 text-right font-semibold text-gray-600">📦 MOQ</th>
                  <th className="py-2 px-3 text-right font-semibold text-gray-600 bg-green-50">✅ รวมสั่ง</th>
                </tr>
              </thead>
              <tbody>
                {reorderData.slice(0, 20).map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${item.urgencyColor}`}>
                        {item.urgency}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-700">{item.productName}</td>
                    <td className="py-2 px-3 font-mono text-gray-500">{item.sku}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{fmtNumber.format(item.currentStock)}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{item.dailySalesRate}</td>
                    <td className={`py-2 px-3 text-right font-medium ${item.daysUntilStockOut <= 7 ? 'text-red-600' : item.daysUntilStockOut <= 14 ? 'text-amber-600' : 'text-gray-600'}`}>
                      {Math.round(item.daysUntilStockOut)} วัน
                    </td>
                    <td className="py-2 px-3 text-right text-gray-600">{item.leadTimeDays} วัน</td>
                    <td className="py-2 px-3 text-right text-gray-600"> {fmtNumber.format(item.suggestedReorderPoint)}</td>
                    <td className="py-2 px-3 text-right font-bold text-blue-600 bg-blue-50">
                      {fmtNumber.format(item.recommendedOrderQty)}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-600">
                      {item.minOrderQty ? fmtNumber.format(item.minOrderQty) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-green-600 bg-green-50">
                      {item.minOrderQty && item.minOrderQty > item.currentStock ? fmtNumber.format(item.minOrderQty) : fmtNumber.format(item.recommendedOrderQty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Low Stock & Near Expiry */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {lowStockData.length > 0 && (
          <DataTable
            data={lowStockData.slice(0, 15)}
            title="🔴 สินค้าสต็อกต่ำ"
            columns={[
              { key: 'productName', label: 'สินค้า' },
              { key: 'sku', label: 'SKU' },
              { key: 'stockOnHand', label: 'คงเหลือ', format: 'number', align: 'right' },
              { key: 'daysRemaining', label: 'เหลือใช้', format: 'days', align: 'right', highlight: true, highlightThreshold: 14 },
            ]}
          />
        )}
        {nearExpiryData.length > 0 && (
          <DataTable
            data={nearExpiryData.slice(0, 15).map(item => ({
              ...item,
              expiryDateFmt: new Date(item.expiryDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }),
              daysLeft: Math.ceil((new Date(item.expiryDate) - new Date()) / (1000 * 60 * 60 * 24))
            }))}
            title="🟡 สินค้าใกล้หมดอายุ"
            columns={[
              { key: 'productName', label: 'สินค้า' },
              { key: 'sku', label: 'SKU' },
              { key: 'batchRef', label: 'ล็อต' },
              { key: 'quantity', label: 'จำนวน', format: 'number', align: 'right' },
              { key: 'expiryDateFmt', label: 'หมดอายุ', align: 'right' },
              { key: 'daysLeft', label: 'เหลือ', format: 'days', align: 'right', highlight: true, highlightThreshold: 7 },
            ]}
          />
        )}
      </div>

      {/* Full Product Analysis Table */}
      <DataTable
        data={fastMoversData}
        title="📋 รายละเอียดสินค้าขายดี"
        columns={[
          { key: 'productName', label: 'สินค้า' },
          { key: 'sku', label: 'SKU' },
          { key: 'categoryName', label: 'หมวดหมู่' },
          { key: 'brandName', label: 'แบรนด์' },
          { key: 'quantitySold', label: 'ขายแล้ว', format: 'number', align: 'right' },
          { key: 'dailySalesRate', label: 'ขาย/วัน', format: 'number', align: 'right' },
          { key: 'currentStock', label: 'คงเหลือ', format: 'number', align: 'right' },
          { key: 'incoming', label: 'กำลังมา', format: 'number', align: 'right' },
          { key: 'daysRemaining', label: 'เหลือใช้', format: 'days', align: 'right', highlight: true, highlightThreshold: 14 },
        ]}
      />
    </div>
  );
}
