import { useEffect, useState } from 'react';
import api from '../api.js';

// ==================== Chart Components ====================

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
        {/* Value Labels on each point */}
        {points.map((p, idx) => (
          <text key={`val-${idx}`} x={p.x} y={p.y - 10} textAnchor="middle" className="text-xs fill-blue-600 font-semibold">
            {p.value.toLocaleString()}
          </text>
        ))}
        {/* Date Labels */}
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

// ==================== Main Component ====================

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortCategory, setSortCategory] = useState('stock');
  const [sortBrand, setSortBrand] = useState('stock');
  const [sortOrderCategory, setSortOrderCategory] = useState('desc');
  const [sortOrderBrand, setSortOrderBrand] = useState('desc');
  const [sortProduct, setSortProduct] = useState('value');
  const [sortOrderProduct, setSortOrderProduct] = useState('desc');

  const fmtNumber = new Intl.NumberFormat('th-TH');
  const fmtCurrency = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });
  const fmtDateTime = (date) => {
    return new Date(date).toLocaleString('th-TH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/inventory/dashboard`);
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

  const LoadingSection = ({ height = 'h-32' }) => (
    <div className={`bg-white rounded-xl shadow p-6 flex items-center justify-center ${height}`}>
      <div className="flex flex-col items-center gap-2">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-sm text-gray-500">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  const summary = data?.summary || {};
  const alerts = data?.alerts || {};
  const movements = data?.movements || {};
  const toReorder = data?.toReorder || [];
  const inboundToday = data?.inboundToday || [];
  const recentActivities = data?.recentActivities || [];
  const dailyOrderVolume = data?.dailyOrderVolume || [];
  const topSalestoday = data?.topSalestoday || [];

  // Prepare chart data
  const categoryPieData = (data?.byCategory || []).map(cat => ({
    label: cat.name,
    value: cat.stock
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

  const dailyVolume = (dailyOrderVolume || []).map(item => ({
    label: item.date,
    value: item.qty
  }));

  // Top 10 products by quantity sold (today)
  const topSales = (topSalestoday || [])
    .map(item => ({
      label: item.productName,
      value: item.quantitySold
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Sorting functions
  const sortTableData = (data, sortKey, sortOrder) => {
    if (!data) return [];
    const sorted = [...data].sort((a, b) => {
      let aVal = 0;
      let bVal = 0;
      
      if (sortKey === 'stock') {
        aVal = a.stock || 0;
        bVal = b.stock || 0;
      } else if (sortKey === 'value') {
        aVal = a.value || 0;
        bVal = b.value || 0;
      }
      
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return sorted.slice(0, 10);
  };

  const handleCategorySort = (key) => {
    if (sortCategory === key) {
      setSortOrderCategory(sortOrderCategory === 'desc' ? 'asc' : 'desc');
    } else {
      setSortCategory(key);
      setSortOrderCategory('desc');
    }
  };

  const handleBrandSort = (key) => {
    if (sortBrand === key) {
      setSortOrderBrand(sortOrderBrand === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBrand(key);
      setSortOrderBrand('desc');
    }
  };

  const handleProductSort = (key) => {
    if (sortProduct === key) {
      setSortOrderProduct(sortOrderProduct === 'desc' ? 'asc' : 'desc');
    } else {
      setSortProduct(key);
      setSortOrderProduct('desc');
    }
  };

  const SortIndicator = ({ isActive, order }) => {
    if (!isActive) return <span className="ml-1 text-gray-300">⇅</span>;
    return <span className="ml-1">{order === 'desc' ? '↓' : '↑'}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">📊 Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">ภาพรวมระบบสต็อก</p>
        </div>
        <button
          onClick={loadData}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 font-medium"
        >
          🔄 รีเฟรช
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {loading ? (
          <>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl shadow-lg p-4 text-white animate-pulse h-24"></div>
            ))}
          </>
        ) : (
          <>
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-4 text-white">
              <p className="text-sm opacity-90 font-medium">📦 สินค้าทั้งหมด</p>
              <p className="text-2xl font-bold mt-1">{fmtNumber.format(summary.totalProducts || 0)}</p>
            </div>
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-lg p-4 text-white">
              <p className="text-sm opacity-90 font-medium">🏷️ รายการสินค้า</p>
              <p className="text-2xl font-bold mt-1">{fmtNumber.format(summary.totalVariants || 0)}</p>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-4 text-white">
              <p className="text-sm opacity-90 font-medium">📈 สต็อกรวม</p>
              <p className="text-2xl font-bold mt-1">{fmtNumber.format(summary.totalStock || 0)}</p>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-4 text-white">
              <p className="text-sm opacity-90 font-medium">💰 มูลค่าสต็อก</p>
              <p className="text-2xl font-bold mt-1">{fmtCurrency.format(summary.totalValue || 0)}</p>
            </div>
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg p-4 text-white">
              <p className="text-sm opacity-90 font-medium">⚠️ สต็อกต่ำ</p>
              <p className="text-2xl font-bold mt-1">{fmtNumber.format(summary.lowStockCount || 0)}</p>
            </div>
            <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg p-4 text-white">
              <p className="text-sm opacity-90 font-medium">❌ หมดสต็อก</p>
              <p className="text-2xl font-bold mt-1">{fmtNumber.format(summary.outOfStockCount || 0)}</p>
            </div>
          </>
        )}
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {loading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-gray-200 rounded-xl shadow p-4 animate-pulse h-20"></div>
            ))}
          </>
        ) : (
          <>
            <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
              <p className="text-sm text-gray-500 font-medium">📋 รอรับของวันนี้</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{fmtNumber.format(inboundToday.length)}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-500">
              <p className="text-sm text-gray-500 font-medium">📝 ใบสั่งวันนี้</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{fmtNumber.format(summary.ordersToday || 0)}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4 border-l-4 border-purple-500">
              <p className="text-sm text-gray-500 font-medium">📁 ต้องสั่งเติม</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{fmtNumber.format(toReorder.length)}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4 border-l-4 border-pink-500">
              <p className="text-sm text-gray-500 font-medium">📦 รอรับ (ค้างอยู่)</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{fmtNumber.format(summary.pendingOrders || 0)}</p>
            </div>
          </>
        )}
      </div>

      {/* To-Do & Inbound Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading ? (
          <>
            <LoadingSection height="h-64" />
            <LoadingSection height="h-64" />
          </>
        ) : (
          <>
            {/* To Reorder */}
            <div className="bg-white rounded-xl shadow p-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-gray-800">🛒 สินค้าต้องสั่งซื้อเติม</h3>
                <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full font-semibold">{toReorder.length}</span>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {toReorder.length > 0 ? (
                  toReorder.map((item, idx) => (
                    <div key={idx} className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 truncate">{item.productName}</p>
                        <p className="text-xs text-gray-600 font-mono">{item.sku}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-700">{fmtNumber.format(item.currentStock)}</p>
                        <p className="text-xs text-gray-500">คงเหลือ</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-500 py-6">
                    <p className="text-sm">✅ ไม่มีสินค้าต้องสั่งซื้อ</p>
                  </div>
                )}
              </div>
            </div>

            {/* Inbound Today */}
            <div className="bg-white rounded-xl shadow p-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-gray-800">📥 สินค้ากำลังจะเข้ามาวันนี้</h3>
                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-semibold">{inboundToday.length}</span>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {inboundToday.length > 0 ? (
                  inboundToday.map((order, idx) => (
                    <div key={idx} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-medium text-gray-800 truncate flex-1">{order.reference || `Order #${idx + 1}`}</p>
                        <span className={`text-xs px-2 py-1 rounded font-semibold ${
                          order.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {order.status === 'completed' ? '✓ รับแล้ว' : '⏳ รอรับ'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 grid grid-cols-2 gap-1">
                        <span>📦 {fmtNumber.format(order.totalQty)} ชิ้น</span>
                        <span>✓ {fmtNumber.format(order.receivedQty)} ชิ้น</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-500 py-6">
                    <p className="text-sm">ไม่มีสินค้ากำลังจะเข้ามาวันนี้</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Charts Row 1: Category & Brand Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading ? (
          <>
            <LoadingSection height="h-96" />
            <LoadingSection height="h-96" />
          </>
        ) : (
          <>
            <PieChart 
              data={categoryPieData} 
              title="📊 สัดส่วนสต็อกตามหมวดหมู่" 
            />
            <PieChart 
              data={(data?.byBrand || []).map(brand => ({
                label: brand.name,
                value: brand.stock
              }))} 
              title="📊 สัดส่วนสต็อกตามแบรนด์" 
            />
          </>
        )}
      </div>

      {/* Unified Category & Brand Summary */}
      {loading ? (
        <LoadingSection height="h-96" />
      ) : (
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">📊 สรุปสต็อกตามหมวดหมู่ และแบรนด์</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Category Section */}
            {(data?.byCategory || []).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 bg-blue-50 px-4 py-2 rounded-lg mb-3 inline-block">📁 หมวดหมู่</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-300 bg-gray-50">
                        <th className="text-left py-2 px-3 font-semibold text-gray-700">ชื่อ</th>
                        <th 
                          className="text-right py-2 px-3 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                          onClick={() => handleCategorySort('stock')}
                        >
                          สต็อก (ชิ้น) <SortIndicator isActive={sortCategory === 'stock'} order={sortOrderCategory} />
                        </th>
                        <th 
                          className="text-right py-2 px-3 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                          onClick={() => handleCategorySort('value')}
                        >
                          มูลค่า (บาท) <SortIndicator isActive={sortCategory === 'value'} order={sortOrderCategory} />
                        </th>
                        <th 
                          className="text-right py-2 px-3 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                          onClick={() => handleCategorySort('percentage')}
                        >
                          % มูลค่า <SortIndicator isActive={sortCategory === 'percentage'} order={sortOrderCategory} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const totalCategoryValue = (data?.byCategory || []).reduce((sum, cat) => sum + (cat.value || 0), 0);
                        let sorted = [...(data?.byCategory || [])].sort((a, b) => {
                          let aVal = 0;
                          let bVal = 0;
                          
                          if (sortCategory === 'stock') {
                            aVal = a.stock || 0;
                            bVal = b.stock || 0;
                          } else if (sortCategory === 'value') {
                            aVal = a.value || 0;
                            bVal = b.value || 0;
                          } else if (sortCategory === 'percentage') {
                            aVal = (a.value || 0) / (totalCategoryValue || 1);
                            bVal = (b.value || 0) / (totalCategoryValue || 1);
                          }
                          
                          return sortOrderCategory === 'desc' ? bVal - aVal : aVal - bVal;
                        });
                        
                        return sorted.slice(0, 10).map((cat, idx) => {
                          const percentage = totalCategoryValue > 0 ? ((cat.value / totalCategoryValue) * 100).toFixed(1) : 0;
                          return (
                            <tr key={idx} className="border-b border-gray-100 hover:bg-blue-50">
                              <td className="py-2.5 px-3 text-gray-800 font-medium">{cat.name}</td>
                              <td className="py-2.5 px-3 text-gray-600 text-right font-semibold">{fmtNumber.format(cat.stock)}</td>
                              <td className="py-2.5 px-3 text-gray-600 text-right">{fmtCurrency.format(cat.value)}</td>
                              <td className="py-2.5 px-3 text-gray-600 text-right font-semibold">{percentage}%</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Brand Section */}
            {(data?.byBrand || []).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 bg-purple-50 px-4 py-2 rounded-lg mb-3 inline-block">🏷️ แบรนด์</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-300 bg-gray-50">
                        <th className="text-left py-2 px-3 font-semibold text-gray-700">ชื่อ</th>
                        <th 
                          className="text-right py-2 px-3 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                          onClick={() => handleBrandSort('stock')}
                        >
                          สต็อก (ชิ้น) <SortIndicator isActive={sortBrand === 'stock'} order={sortOrderBrand} />
                        </th>
                        <th 
                          className="text-right py-2 px-3 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                          onClick={() => handleBrandSort('value')}
                        >
                          มูลค่า (บาท) <SortIndicator isActive={sortBrand === 'value'} order={sortOrderBrand} />
                        </th>
                        <th 
                          className="text-right py-2 px-3 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                          onClick={() => handleBrandSort('percentage')}
                        >
                          % มูลค่า <SortIndicator isActive={sortBrand === 'percentage'} order={sortOrderBrand} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const totalBrandValue = (data?.byBrand || []).reduce((sum, brand) => sum + (brand.value || 0), 0);
                        let sorted = [...(data?.byBrand || [])].sort((a, b) => {
                          let aVal = 0;
                          let bVal = 0;
                          
                          if (sortBrand === 'stock') {
                            aVal = a.stock || 0;
                            bVal = b.stock || 0;
                          } else if (sortBrand === 'value') {
                            aVal = a.value || 0;
                            bVal = b.value || 0;
                          } else if (sortBrand === 'percentage') {
                            aVal = (a.value || 0) / (totalBrandValue || 1);
                            bVal = (b.value || 0) / (totalBrandValue || 1);
                          }
                          
                          return sortOrderBrand === 'desc' ? bVal - aVal : aVal - bVal;
                        });
                        
                        return sorted.slice(0, 10).map((brand, idx) => {
                          const percentage = totalBrandValue > 0 ? ((brand.value / totalBrandValue) * 100).toFixed(1) : 0;
                          return (
                            <tr key={idx} className="border-b border-gray-100 hover:bg-purple-50">
                              <td className="py-2.5 px-3 text-gray-800 font-medium">{brand.name}</td>
                              <td className="py-2.5 px-3 text-gray-600 text-right font-semibold">{fmtNumber.format(brand.stock)}</td>
                              <td className="py-2.5 px-3 text-gray-600 text-right">{fmtCurrency.format(brand.value)}</td>
                              <td className="py-2.5 px-3 text-gray-600 text-right font-semibold">{percentage}%</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Stock Value & Top Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading ? (
          <>
            <LoadingSection height="h-80" />
            <LoadingSection height="h-80" />
          </>
        ) : (
          <>
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">💰 มูลค่าสต็อกแต่ละสินค้า</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-300 bg-gray-50">
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">ชื่อสินค้า</th>
                      <th 
                        className="text-right py-2 px-3 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleProductSort('stock')}
                      >
                        จำนวน (ชิ้น) <SortIndicator isActive={sortProduct === 'stock'} order={sortOrderProduct} />
                      </th>
                      <th 
                        className="text-right py-2 px-3 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleProductSort('value')}
                      >
                        มูลค่า (บาท) <SortIndicator isActive={sortProduct === 'value'} order={sortOrderProduct} />
                      </th>
                      <th 
                        className="text-right py-2 px-3 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleProductSort('percentage')}
                      >
                        % มูลค่า <SortIndicator isActive={sortProduct === 'percentage'} order={sortOrderProduct} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const totalProductValue = (data?.productStockValues || []).reduce((sum, product) => sum + (product.value || 0), 0);
                      const sorted = [...(data?.productStockValues || [])].sort((a, b) => {
                        let aVal = 0;
                        let bVal = 0;
                        
                        if (sortProduct === 'stock') {
                          aVal = a.stock || 0;
                          bVal = b.stock || 0;
                        } else if (sortProduct === 'value') {
                          aVal = a.value || 0;
                          bVal = b.value || 0;
                        } else if (sortProduct === 'percentage') {
                          aVal = (a.value || 0) / (totalProductValue || 1);
                          bVal = (b.value || 0) / (totalProductValue || 1);
                        }
                        
                        return sortOrderProduct === 'desc' ? bVal - aVal : aVal - bVal;
                      });
                      
                      return sorted.slice(0, 20).map((item, idx) => {
                        const percentage = totalProductValue > 0 ? ((item.value / totalProductValue) * 100).toFixed(1) : 0;
                        return (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-2.5 px-3 text-gray-800 font-medium">{item.productName || 'ไม่ระบุ'}</td>
                            <td className="py-2.5 px-3 text-gray-600 text-right font-semibold">{fmtNumber.format(item.stock || 0)}</td>
                            <td className="py-2.5 px-3 text-gray-600 text-right font-semibold">{fmtCurrency.format(item.value || 0)}</td>
                            <td className="py-2.5 px-3 text-gray-600 text-right font-semibold">{percentage}%</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
            {topSales.length > 0 && (
              <BarChart 
                data={topSales}
                title="🔥 Top 10 สินค้าขายเยอะสุดวันนี้"
                color="#10B981"
                valueKey="value"
                labelKey="label"
              />
            )}
          </>
        )}
      </div>

      {/* Charts Row 2: Daily Volume & Movement Summary */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LoadingSection height="h-64" />
          <LoadingSection height="h-48" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LineChart 
            data={dailyVolume}
            title="📈 ยอดจำนวนชิ้นที่ขาย 7 วันย้อนหลัง"
          />
          {movements?.byType?.length > 0 && (
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">📦 การเคลื่อนไหวสต็อก (7 วันล่าสุด)</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(movements.byType || []).map((item) => (
                  <div key={item._id} className={`rounded-lg p-3 ${
                    item._id === 'in' ? 'bg-green-50 border border-green-200' :
                    item._id === 'out' ? 'bg-blue-50 border border-blue-200' :
                    item._id === 'damage' ? 'bg-red-50 border border-red-200' :
                    item._id === 'expired' ? 'bg-orange-50 border border-orange-200' :
                    'bg-gray-50 border border-gray-200'
                  }`}>
                    <p className="text-xs text-gray-600 font-medium">
                      {item._id === 'in' && '📥 รับเข้า'}
                      {item._id === 'out' && '📤 จ่ายออก'}
                      {item._id === 'adjust' && '🔄 ปรับปรุง'}
                      {item._id === 'return' && '↩️ รับคืน'}
                      {item._id === 'damage' && '💔 เสียหาย'}
                      {item._id === 'expired' && '⏰ หมดอายุ'}
                    </p>
                    <p className="text-lg font-bold text-gray-800 mt-1">{fmtNumber.format(item.count)}</p>
                    <p className="text-xs text-gray-500">{fmtNumber.format(Math.abs(item.totalQuantity))} ชิ้น</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
