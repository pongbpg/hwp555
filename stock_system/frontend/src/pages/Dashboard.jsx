import { useEffect, useState } from 'react';
import api from '../api.js';

// Simple Pie Chart Component
const PieChart = ({ data, title }) => {
  if (!data || data.length === 0) return null;
  
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let currentAngle = 0;
  
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];
  
  const paths = data.slice(0, 10).map((item, idx) => {
    const percentage = total > 0 ? (item.value / total) * 100 : 0;
    const angle = (percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;
    
    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);
    
    const x1 = 100 + 80 * Math.cos(startRad);
    const y1 = 100 + 80 * Math.sin(startRad);
    const x2 = 100 + 80 * Math.cos(endRad);
    const y2 = 100 + 80 * Math.sin(endRad);
    
    const largeArc = angle > 180 ? 1 : 0;
    
    return {
      path: `M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: colors[idx % colors.length],
      label: item.label,
      value: item.value,
      percentage: percentage.toFixed(1)
    };
  });
  
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <div className="flex flex-col lg:flex-row items-center gap-6">
        <svg viewBox="0 0 200 200" className="w-48 h-48">
          {paths.map((p, idx) => (
            <path key={idx} d={p.path} fill={p.color} className="hover:opacity-80 transition-opacity cursor-pointer">
              <title>{p.label}: {p.value.toLocaleString()} ({p.percentage}%)</title>
            </path>
          ))}
        </svg>
        <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
          {paths.map((p, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }}></div>
              <span className="truncate">{p.label}</span>
              <span className="text-gray-500 ml-auto">{p.percentage}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Bar Chart Component
const BarChart = ({ data, title, valueKey = 'value', labelKey = 'label', color = '#3B82F6' }) => {
  if (!data || data.length === 0) return null;
  
  const maxValue = Math.max(...data.map(d => d[valueKey] || 0));
  const fmtNumber = new Intl.NumberFormat('th-TH');
  
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <div className="space-y-3">
        {data.slice(0, 10).map((item, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div className="w-32 text-sm text-gray-600 truncate" title={item[labelKey]}>
              {item[labelKey]}
            </div>
            <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-500"
                style={{ 
                  width: `${maxValue > 0 ? (item[valueKey] / maxValue) * 100 : 0}%`,
                  backgroundColor: color 
                }}
              ></div>
            </div>
            <div className="w-20 text-right text-sm font-medium text-gray-700">
              {fmtNumber.format(item[valueKey])}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Line Chart Component
const LineChart = ({ data, title }) => {
  if (!data || data.length === 0) return null;
  
  const maxValue = Math.max(...data.map(d => d.value || 0), 1);
  const points = data.map((d, idx) => ({
    x: 40 + (idx * (320 / Math.max(data.length - 1, 1))),
    y: 160 - ((d.value / maxValue) * 120),
    ...d
  }));
  
  const pathD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = pathD + ` L ${points[points.length - 1]?.x || 40} 160 L 40 160 Z`;
  
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <svg viewBox="0 0 400 180" className="w-full h-40">
        {/* Grid lines */}
        {[0, 40, 80, 120].map(y => (
          <line key={y} x1="40" y1={40 + y} x2="360" y2={40 + y} stroke="#E5E7EB" strokeWidth="1" />
        ))}
        {/* Area */}
        <path d={areaD} fill="url(#gradient)" opacity="0.3" />
        {/* Line */}
        <path d={pathD} fill="none" stroke="#3B82F6" strokeWidth="2" />
        {/* Points */}
        {points.map((p, idx) => (
          <circle key={idx} cx={p.x} cy={p.y} r="4" fill="#3B82F6">
            <title>{p.label}: {p.value.toLocaleString()}</title>
          </circle>
        ))}
        {/* Labels */}
        {points.filter((_, i) => i % Math.ceil(points.length / 7) === 0 || i === points.length - 1).map((p, idx) => (
          <text key={idx} x={p.x} y="175" textAnchor="middle" className="text-xs fill-gray-500">{p.label}</text>
        ))}
        <defs>
          <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};

// Donut Chart Component
const DonutChart = ({ data, title, centerText }) => {
  if (!data || data.length === 0) return null;
  
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let currentAngle = 0;
  
  const colors = ['#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'];
  
  const paths = data.slice(0, 5).map((item, idx) => {
    const percentage = total > 0 ? (item.value / total) * 100 : 0;
    const angle = (percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;
    
    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);
    
    const outerX1 = 100 + 80 * Math.cos(startRad);
    const outerY1 = 100 + 80 * Math.sin(startRad);
    const outerX2 = 100 + 80 * Math.cos(endRad);
    const outerY2 = 100 + 80 * Math.sin(endRad);
    const innerX1 = 100 + 50 * Math.cos(endRad);
    const innerY1 = 100 + 50 * Math.sin(endRad);
    const innerX2 = 100 + 50 * Math.cos(startRad);
    const innerY2 = 100 + 50 * Math.sin(startRad);
    
    const largeArc = angle > 180 ? 1 : 0;
    
    return {
      path: `M ${outerX1} ${outerY1} A 80 80 0 ${largeArc} 1 ${outerX2} ${outerY2} L ${innerX1} ${innerY1} A 50 50 0 ${largeArc} 0 ${innerX2} ${innerY2} Z`,
      color: colors[idx % colors.length],
      label: item.label,
      value: item.value,
      percentage: percentage.toFixed(1)
    };
  });
  
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <div className="flex flex-col items-center">
        <div className="relative">
          <svg viewBox="0 0 200 200" className="w-40 h-40">
            {paths.map((p, idx) => (
              <path key={idx} d={p.path} fill={p.color} className="hover:opacity-80 transition-opacity cursor-pointer">
                <title>{p.label}: {p.value.toLocaleString()} ({p.percentage}%)</title>
              </path>
            ))}
          </svg>
          {centerText && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-gray-700">{centerText}</span>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm">
          {paths.map((p, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></div>
              <span>{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fmtNumber = new Intl.NumberFormat('th-TH');
  const fmtCurrency = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/inventory/dashboard');
      setData(res.data);
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.error;
      if (status === 403) {
        setError('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
      } else if (status === 401) {
        setError('กรุณาเข้าสู่ระบบใหม่');
      } else if (!message || message.includes('Failed')) {
        setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
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
      <div className="bg-white rounded-xl shadow p-8 text-center">
        <div className="text-6xl mb-4">⚠️</div>
        <p className="text-gray-600 mb-4">{error}</p>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg" onClick={loadData}>
          🔄 ลองอีกครั้ง
        </button>
      </div>
    );
  }

  const summary = data?.summary || {};
  const alerts = data?.alerts || {};
  const movements = data?.movements || {};

  // Prepare chart data
  const categoryPieData = (data?.byCategory || []).map(cat => ({
    label: cat.name,
    value: cat.stock
  }));
  
  const categoryValueData = (data?.byCategory || []).map(cat => ({
    label: cat.name,
    value: cat.value
  }));
  
  const movementTrendData = (data?.movementTrend || []).map(m => ({
    label: m.date,
    value: m.count
  }));
  
  const stockStatusData = [
    { label: 'ปกติ', value: summary.normalStockCount || 0 },
    { label: 'สต็อกต่ำ', value: summary.lowStockCount || 0 },
    { label: 'หมดสต็อก', value: summary.outOfStockCount || 0 }
  ].filter(d => d.value > 0);

  const topCategoriesBar = (data?.byCategory || []).map(cat => ({
    label: cat.name,
    value: cat.stock
  }));
  
  const topBrandsBar = (data?.byBrand || []).map(brand => ({
    label: brand.name,
    value: brand.stock
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📊 Dashboard</h1>
          <p className="text-gray-500 text-sm">ภาพรวมระบบสต็อก</p>
        </div>
        <button
          onClick={loadData}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          🔄 รีเฟรช
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-4 text-white">
          <p className="text-sm opacity-90">📦 สินค้าทั้งหมด</p>
          <p className="text-2xl font-bold">{fmtNumber.format(summary.totalProducts || 0)}</p>
        </div>
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-lg p-4 text-white">
          <p className="text-sm opacity-90">🏷️ รายการสินค้า</p>
          <p className="text-2xl font-bold">{fmtNumber.format(summary.totalVariants || 0)}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-4 text-white">
          <p className="text-sm opacity-90">📈 สต็อกรวม</p>
          <p className="text-2xl font-bold">{fmtNumber.format(summary.totalStock || 0)}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-4 text-white">
          <p className="text-sm opacity-90">💰 มูลค่าสต็อก</p>
          <p className="text-2xl font-bold">{fmtCurrency.format(summary.totalValue || 0)}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg p-4 text-white">
          <p className="text-sm opacity-90">⚠️ สต็อกต่ำ</p>
          <p className="text-2xl font-bold">{fmtNumber.format(summary.lowStockCount || 0)}</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg p-4 text-white">
          <p className="text-sm opacity-90">❌ หมดสต็อก</p>
          <p className="text-2xl font-bold">{fmtNumber.format(summary.outOfStockCount || 0)}</p>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">📋 ใบสั่งซื้อรอรับ</p>
          <p className="text-xl font-bold text-gray-800">{fmtNumber.format(summary.pendingOrders || 0)}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-500">📝 ใบสั่งวันนี้</p>
          <p className="text-xl font-bold text-gray-800">{fmtNumber.format(summary.ordersToday || 0)}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-purple-500">
          <p className="text-sm text-gray-500">📁 หมวดหมู่</p>
          <p className="text-xl font-bold text-gray-800">{fmtNumber.format((data?.byCategory || []).length)}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-pink-500">
          <p className="text-sm text-gray-500">🏷️ แบรนด์</p>
          <p className="text-xl font-bold text-gray-800">{fmtNumber.format((data?.byBrand || []).length)}</p>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PieChart 
          data={categoryPieData} 
          title="📊 สัดส่วนสต็อกตามหมวดหมู่" 
        />
        <DonutChart 
          data={stockStatusData} 
          title="📈 สถานะสต็อก" 
          centerText={fmtNumber.format(summary.totalVariants || 0)}
        />
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChart 
          data={topCategoriesBar}
          title="📦 Top 10 หมวดหมู่ (จำนวนสต็อก)"
          color="#3B82F6"
        />
        <BarChart 
          data={topBrandsBar}
          title="🏷️ Top 10 แบรนด์ (จำนวนสต็อก)"
          color="#8B5CF6"
        />
      </div>

      {/* Movement Trend */}
      {movementTrendData.length > 0 && (
        <LineChart 
          data={movementTrendData}
          title="📈 แนวโน้มการเคลื่อนไหวสต็อก (7 วันล่าสุด)"
        />
      )}

      {/* Movement Summary */}
      {movements?.byType?.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">📦 การเคลื่อนไหวสต็อก (7 วันล่าสุด)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {(movements.byType || []).map((item) => (
              <div key={item._id} className={`rounded-xl p-4 ${
                item._id === 'in' ? 'bg-green-50 border border-green-200' :
                item._id === 'out' ? 'bg-blue-50 border border-blue-200' :
                item._id === 'damage' ? 'bg-red-50 border border-red-200' :
                item._id === 'expired' ? 'bg-orange-50 border border-orange-200' :
                'bg-gray-50 border border-gray-200'
              }`}>
                <p className="text-sm text-gray-600">
                  {item._id === 'in' && '📥 รับเข้า'}
                  {item._id === 'out' && '📤 จ่ายออก'}
                  {item._id === 'adjust' && '🔄 ปรับปรุง'}
                  {item._id === 'return' && '↩️ รับคืน'}
                  {item._id === 'damage' && '💔 เสียหาย'}
                  {item._id === 'expired' && '⏰ หมดอายุ'}
                </p>
                <p className="text-2xl font-bold text-gray-800">{fmtNumber.format(item.count)}</p>
                <p className="text-xs text-gray-500">{fmtNumber.format(Math.abs(item.totalQuantity))} ชิ้น</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts Summary */}
      {alerts?.total > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">🔔 การแจ้งเตือน</h2>
            <div className="flex gap-2">
              {alerts.critical > 0 && (
                <span className="bg-red-500 text-white text-xs px-3 py-1 rounded-full">
                  {alerts.critical} ด่วน
                </span>
              )}
              {alerts.warning > 0 && (
                <span className="bg-amber-500 text-white text-xs px-3 py-1 rounded-full">
                  {alerts.warning} เตือน
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <p className="text-3xl font-bold text-red-600">{alerts.outOfStock || 0}</p>
              <p className="text-sm text-gray-600">หมดสต็อก</p>
            </div>
            <div className="text-center p-4 bg-amber-50 rounded-lg">
              <p className="text-3xl font-bold text-amber-600">{alerts.lowStock || 0}</p>
              <p className="text-sm text-gray-600">สต็อกต่ำ</p>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <p className="text-3xl font-bold text-orange-600">{alerts.nearExpiry || 0}</p>
              <p className="text-sm text-gray-600">ใกล้หมดอายุ</p>
            </div>
          </div>
        </div>
      )}

      {/* Category & Brand Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Table */}
        {(data?.byCategory || []).length > 0 && (
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">📁 สต็อกตามหมวดหมู่</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">หมวดหมู่</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">สต็อก</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">มูลค่า</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.byCategory || []).slice(0, 8).map((cat, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-sm text-gray-800">{cat.name}</td>
                      <td className="py-2 px-3 text-sm text-gray-600 text-right">{fmtNumber.format(cat.stock)}</td>
                      <td className="py-2 px-3 text-sm text-gray-600 text-right">{fmtCurrency.format(cat.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Brand Table */}
        {(data?.byBrand || []).length > 0 && (
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">🏷️ สต็อกตามแบรนด์</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">แบรนด์</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">สต็อก</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">มูลค่า</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.byBrand || []).slice(0, 8).map((brand, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-sm text-gray-800">{brand.name}</td>
                      <td className="py-2 px-3 text-sm text-gray-600 text-right">{fmtNumber.format(brand.stock)}</td>
                      <td className="py-2 px-3 text-sm text-gray-600 text-right">{fmtCurrency.format(brand.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
