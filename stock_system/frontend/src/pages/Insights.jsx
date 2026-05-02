import React, { useEffect, useState, useCallback } from 'react';
import moment from 'moment-timezone';
import api from '../api.js';
import DateRangeFilter from '../components/DateRangeFilter.jsx';

// ==================== Chart Components ====================

// Pie Chart Component
const PieChart = ({ data, title, dataKey = 'value', labelKey = 'label', colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'] }) => {
  if (!data || data.length === 0) return null;

  const total = data.reduce((sum, item) => sum + (item[dataKey] || 0), 0);
  let currentAngle = -90;
  const slices = data.map((item, idx) => {
    const value = item[dataKey] || 0;
    const percentage = (value / total) * 100;
    const sliceAngle = (percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = 50 + 40 * Math.cos(startRad);
    const y1 = 50 + 40 * Math.sin(startRad);
    const x2 = 50 + 40 * Math.cos(endRad);
    const y2 = 50 + 40 * Math.sin(endRad);
    const largeArc = sliceAngle > 180 ? 1 : 0;

    const path = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`;
    currentAngle = endAngle;

    return { path, color: colors[idx % colors.length], label: item[labelKey], value, percentage };
  });

  const fmtNumber = new Intl.NumberFormat('th-TH');

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <div className="flex gap-6 justify-center items-center flex-wrap">
        <svg viewBox="0 0 100 100" className="w-40 h-40 flex-shrink-0">
          {slices.map((slice, idx) => (
            <path key={idx} d={slice.path} fill={slice.color} stroke="white" strokeWidth="2" />
          ))}
        </svg>
        <div className="flex-1 min-w-48 space-y-2 text-sm">
          {slices.map((slice, idx) => (
            <div key={idx} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: slice.color }}></div>
                <span className="text-gray-700 truncate">{slice.label}</span>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-semibold text-gray-800">{fmtNumber.format(slice.value)}</div>
                <div className="text-xs text-gray-500">{slice.percentage.toFixed(1)}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Horizontal Bar Chart
const HBarChart = ({ data, title, valueKey = 'value', labelKey = 'label', color = '#3B82F6', maxItems = 12 }) => {
  if (!data || data.length === 0) return null;

  const maxValue = Math.max(...data.map(d => d[valueKey] || 0), 1);
  const fmtNumber = new Intl.NumberFormat('th-TH');

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <div className="space-y-3">
        {data.slice(0, maxItems).map((item, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div className="w-6 text-xs text-gray-400 text-right font-semibold">#{idx + 1}</div>
            <div className="w-32 text-xs text-gray-700 truncate font-medium" title={item[labelKey]}>
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
            <div className="w-20 text-right text-xs font-semibold text-gray-700">
              {fmtNumber.format(item[valueKey])}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Expandable Fast Movers Table (Grouped by Product Name)
const ExpandableFastMoversTable = ({ data, title, columns = 'sales' }) => {
  const [expandedProducts, setExpandedProducts] = useState(new Set());
  const [sortField, setSortField] = useState('totalQuantitySold');
  const [sortOrder, setSortOrder] = useState('desc');
  const fmtNumber = new Intl.NumberFormat('th-TH');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">⇅</span>;
    return <span className="text-blue-600 ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  // Group by productName (ไม่ slice - แสดงทั้งหมด)
  const groupedByProduct = (() => {
    const map = new Map();
    data.forEach(item => {
      const key = item.productName;
      if (!map.has(key)) {
        map.set(key, {
          productName: item.productName,
          categoryName: item.categoryName,
          brandName: item.brandName,
          totalQuantitySold: 0,
          avgDailyRate: 0,
          totalStock: 0,
          totalPurchaseRemaining: 0,
          variants: []
        });
      }
      const group = map.get(key);
      group.totalQuantitySold += item.quantitySold || 0;
      group.avgDailyRate += item.dailySalesRate || 0;
      // ✅ currentStock = availableStock (รวม purchaseRemaining แล้ว) ดังนั้นไม่ต้องลบ incoming
      group.totalStock += item.currentStock || 0;
      // ✅ ใช้ purchaseRemaining (ยอดค้างรับจาก purchase orders) แทน incoming
      group.totalPurchaseRemaining += item.purchaseRemaining || 0;
      group.variants.push(item);
    });
    return Array.from(map.values());
  })();

  // Sort the grouped data
  const sortedGroupedByProduct = [...groupedByProduct].sort((a, b) => {
    let aVal, bVal;
    
    if (sortField === 'productName') {
      aVal = a.productName;
      bVal = b.productName;
      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    } else if (sortField === 'brandName') {
      aVal = a.brandName || '';
      bVal = b.brandName || '';
      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    } else if (sortField === 'categoryName') {
      aVal = a.categoryName || '';
      bVal = b.categoryName || '';
      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    } else if (sortField === 'totalQuantitySold') {
      aVal = a.totalQuantitySold || 0;
      bVal = b.totalQuantitySold || 0;
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    } else if (sortField === 'avgDailyRate') {
      aVal = a.avgDailyRate || 0;
      bVal = b.avgDailyRate || 0;
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    } else if (sortField === 'totalStock') {
      aVal = a.totalStock || 0;
      bVal = b.totalStock || 0;
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    } else if (sortField === 'totalPurchaseRemaining') {
      aVal = a.totalPurchaseRemaining || 0;
      bVal = b.totalPurchaseRemaining || 0;
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });

  const toggleExpand = (productName) => {
    const newSet = new Set(expandedProducts);
    if (newSet.has(productName)) {
      newSet.delete(productName);
    } else {
      newSet.add(productName);
    }
    setExpandedProducts(newSet);
  };

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-300">
              <th className="py-3 px-4 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition" onClick={() => handleSort('productName')}>
                สินค้า <SortIcon field="productName" />
              </th>
              <th className="py-3 px-4 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition" onClick={() => handleSort('brandName')}>
                แบรนด์ <SortIcon field="brandName" />
              </th>
              <th className="py-3 px-4 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition" onClick={() => handleSort('categoryName')}>
                หมวดหมู่ <SortIcon field="categoryName" />
              </th>
              {columns === 'sales' && (
                <>
                  <th className="py-3 px-4 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition" onClick={() => handleSort('totalQuantitySold')}>
                    ยอดขาย (ชิ้น) <SortIcon field="totalQuantitySold" />
                  </th>
                  <th className="py-3 px-4 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition" onClick={() => handleSort('avgDailyRate')}>
                    อัตรา/วัน <SortIcon field="avgDailyRate" />
                  </th>
                </>
              )}
              {columns === 'stock' && (
                <>
                  <th className="py-3 px-4 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition" onClick={() => handleSort('totalStock')}>
                    สต็อกคงเหลือ <SortIcon field="totalStock" />
                  </th>
                  <th className="py-3 px-4 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition" onClick={() => handleSort('totalPurchaseRemaining')}>
                    ค้างรับ <SortIcon field="totalPurchaseRemaining" />
                  </th>
                  <th className="py-3 px-4 text-right font-semibold text-gray-700">รวม</th>
                </>
              )}
              <th className="py-3 px-4 text-center font-semibold text-gray-700">SKU</th>
            </tr>
          </thead>
          <tbody>
            {sortedGroupedByProduct.map((group, groupIdx) => (
              <React.Fragment key={group.productName}>
                {/* Parent Row - Product */}
                <tr className="border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition" onClick={() => toggleExpand(group.productName)}>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className={`transform transition-transform ${expandedProducts.has(group.productName) ? 'rotate-90' : ''}`}>
                        ▶
                      </span>
                      <span className="font-semibold text-gray-800">{group.productName}</span>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">{group.variants.length} SKU</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{group.brandName || '-'}</td>
                  <td className="py-3 px-4 text-gray-600">{group.categoryName || '-'}</td>
                  {columns === 'sales' && (
                    <>
                      <td className="py-3 px-4 text-right font-bold text-gray-800">{fmtNumber.format(group.totalQuantitySold)}</td>
                      <td className="py-3 px-4 text-right text-gray-600 font-medium">{group.avgDailyRate?.toFixed(2) || '-'}</td>
                    </>
                  )}
                  {columns === 'stock' && (
                    <>
                      {/* ✅ totalStock เป็น availableStock (รวม purchaseRemaining แล้ว) */}
                      <td className="py-3 px-4 text-right font-bold text-gray-800">{fmtNumber.format(group.totalStock)}</td>
                      <td className="py-3 px-4 text-right font-bold text-amber-600">{fmtNumber.format(group.totalPurchaseRemaining)}</td>
                      {/* ✅ รวม = totalStock + totalPurchaseRemaining (แต่ totalStock รวม purchaseRemaining แล้ว) */}
                      {/* ขึ้นอยู่กับ backend ส่งอะไรมา ถ้า totalStock คำนวณจาก stockOnHand ต้องบวก totalPurchaseRemaining */}
                      <td className="py-3 px-4 text-right font-bold text-gray-800">{fmtNumber.format(group.totalStock)}</td>
                    </>
                  )}
                  <td className="py-3 px-4 text-center text-gray-500">รวม</td>
                </tr>
                
                {/* Child Rows - SKU Details */}
                {expandedProducts.has(group.productName) && group.variants.map((variant, variantIdx) => (
                  <tr key={`${group.productName}-${variant.sku}`} className="border-b border-gray-100 bg-gray-50 hover:bg-gray-100 transition">
                    <td className="py-3 px-4 pl-12 text-gray-700"></td>
                    <td className="py-3 px-4 text-gray-600"></td>
                    <td className="py-3 px-4 text-gray-600"></td>
                    {columns === 'sales' && (
                      <>
                        <td className="py-3 px-4 text-right text-gray-700 font-medium">{fmtNumber.format(variant.quantitySold || 0)}</td>
                        <td className="py-3 px-4 text-right text-gray-600">{variant.dailySalesRate?.toFixed(2) || '-'}</td>
                      </>
                    )}
                    {columns === 'stock' && (
                      <>
                        {/* ✅ variant.stockOnHand = currentStock - incoming (สต็อกจริง) */}
                        <td className="py-3 px-4 text-right text-gray-700 font-medium">{fmtNumber.format(variant.stockOnHand || 0)}</td>
                        {/* ✅ variant.purchaseRemaining = สินค้าค้างรับจาก PO */}
                        <td className="py-3 px-4 text-right text-amber-600 font-medium">{fmtNumber.format(variant.purchaseRemaining || 0)}</td>
                        {/* ✅ รวม = stockOnHand + purchaseRemaining */}
                        <td className="py-3 px-4 text-right text-gray-700 font-medium">{fmtNumber.format((variant.stockOnHand || 0) + (variant.purchaseRemaining || 0))}</td>
                      </>
                    )}
                    <td className="py-3 px-4 text-center">
                      <span className="font-mono text-xs bg-gray-200 text-gray-800 px-2 py-1 rounded">{variant.sku}</span>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Gauge Chart
const GaugeChart = ({ value, max, title, unit = '', colorRange = ['#EF4444', '#F59E0B', '#10B981'] }) => {
  // ✅ ป้องกัน NaN ใน SVG paths
  const safeValue = Number(value) || 0;
  const safeMax = Number(max) || 1;
  const percentage = Math.min(100, Math.max(0, (safeValue / safeMax) * 100));
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
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#E5E7EB" strokeWidth="8" strokeLinecap="round" />
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke={getColor()}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${percentage * 1.26} 126`}
          />
          <line
            x1="50" y1="50"
            x2={50 + 30 * Math.cos((angle || 0) * Math.PI / 180)}
            y2={50 + 30 * Math.sin((angle || 0) * Math.PI / 180)}
            stroke="#374151"
            strokeWidth="2"
          />
          <circle cx="50" cy="50" r="4" fill="#374151" />
        </svg>
      </div>
      <div className="text-xl font-bold text-gray-800 mt-2">{safeValue.toLocaleString()}{unit}</div>
      <div className="text-xs text-gray-500">จาก {safeMax.toLocaleString()}</div>
    </div>
  );
};

// Alert Cards - With Table Format
const AlertCard = ({ severity = 'warning', title, items = [], columns = null }) => {
  const severityConfig = {
    critical: { bg: 'bg-red-50', border: 'border-red-300', badge: 'bg-red-100 text-red-700', icon: '🚨', headerBg: 'bg-red-100' },
    warning: { bg: 'bg-amber-50', border: 'border-amber-300', badge: 'bg-amber-100 text-amber-700', icon: '⚠️', headerBg: 'bg-amber-100' },
    info: { bg: 'bg-blue-50', border: 'border-blue-300', badge: 'bg-blue-100 text-blue-700', icon: 'ℹ️', headerBg: 'bg-blue-100' },
  };
  const config = severityConfig[severity] || severityConfig.warning;

  // Default columns if not specified
  const defaultColumns = [
    { label: 'สินค้า', key: 'productName' },
    { label: 'SKU', key: 'sku' },
    { label: 'คงเหลือ', key: 'stockOnHand', align: 'right' },
    { label: 'เหลือใช้', key: 'daysRemaining', align: 'right' },
  ];

  const displayColumns = columns || defaultColumns;

  // Check if we have detailed data (for table view)
  // ตรวจสอบว่าถ้ากำหนด columns มาแล้ว หรือมี stockOnHand ให้ใช้ table view
  const hasDetailedData = items.length > 0 && (columns !== null || items[0].stockOnHand !== undefined);

  if (!hasDetailedData) {
    // Simple list view (fallback for non-structured data)
    return (
      <div className={`${config.bg} border-2 ${config.border} rounded-xl p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${config.badge}`}>
            {config.icon} {title}
          </span>
          <span className="text-sm font-bold text-gray-700 ml-auto">{items.length} รายการ</span>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {items.slice(0, 8).map((item, idx) => (
            <div key={idx} className="text-xs text-gray-700 flex items-center justify-between gap-2 bg-white/60 px-2 py-1 rounded">
              <span className="truncate font-medium">{item.productName} ({item.sku})</span>
              <span className="text-gray-600 whitespace-nowrap font-semibold flex-shrink-0">{item.value}</span>
            </div>
          ))}
          {items.length > 8 && (
            <div className="text-xs text-gray-600 font-medium pt-2 border-t border-gray-300">
              +{items.length - 8} รายการเพิ่มเติม
            </div>
          )}
        </div>
      </div>
    );
  }

  // Table view for detailed data
  const fmtNumber = new Intl.NumberFormat('th-TH');

  return (
    <div className="bg-white border-2 border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className={`${config.headerBg} px-6 py-4 border-b-2 ${config.border}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{config.icon}</span>
            <h4 className="font-semibold text-gray-800">{title}</h4>
          </div>
          <span className="text-sm font-bold text-gray-700 bg-white/50 px-3 py-1 rounded-full">
            {items.length} รายการ
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr className="border-b border-gray-200">
              {displayColumns.map((col, idx) => (
                <th
                  key={idx}
                  className={`px-4 py-3 font-semibold text-gray-700 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'
                    } ${idx === 0 ? 'bg-gray-100' : ''}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 15).map((item, idx) => (
              <tr
                key={idx}
                className={`border-b border-gray-100 hover:bg-gray-50 transition ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                  }`}
              >
                {displayColumns.map((col, colIdx) => {
                  let value = item[col.key];

                  // Format numbers
                  if (col.format === 'number' && typeof value === 'number') {
                    value = fmtNumber.format(value);
                  }

                  return (
                    <td
                      key={colIdx}
                      className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.highlight && value < col.highlightThreshold ? 'font-semibold text-red-600' : 'text-gray-700'
                        }`}
                    >
                      {value ?? '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer if more items */}
      {items.length > 15 && (
        <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 text-xs font-medium text-gray-600">
          แสดง 15 / {items.length} รายการ
        </div>
      )}
    </div>
  );
};

// Data Table Component
const DataTable = ({ data, columns, title }) => {
  if (!data || data.length === 0) return null;

  const [sortField, setSortField] = useState(null);
  const [sortOrder, setSortOrder] = useState('desc');
  const fmtNumber = new Intl.NumberFormat('th-TH');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">⇅</span>;
    return <span className="text-blue-600 ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  // Sort data
  const sortedData = [...data].sort((a, b) => {
    if (!sortField) return 0;

    let aVal = a[sortField];
    let bVal = b[sortField];

    // Handle null/undefined
    if (aVal == null) aVal = '';
    if (bVal == null) bVal = '';

    // String comparison
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    // Number comparison
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    }

    return 0;
  });

  return (
    <div className={title ? "bg-white rounded-xl shadow p-6" : ""}>
      {title && <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-300">
              {columns.map((col, idx) => (
                <th 
                  key={idx} 
                  className={`py-3 px-3 font-semibold text-gray-700 ${col.align === 'right' ? 'text-right' : 'text-left'} cursor-pointer hover:bg-gray-100 transition`}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label} <SortIcon field={col.key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b border-gray-100 hover:bg-blue-50 transition">
                {columns.map((col, colIdx) => {
                  let value = row[col.key];
                  if (col.format === 'number') value = fmtNumber.format(value || 0);
                  if (col.format === 'percent') value = `${(value || 0).toFixed(1)}%`;
                  if (col.format === 'days') value = value === 999999 ? '∞' : `${Math.round(value || 0)} วัน`;

                  return (
                    <td key={colIdx} className={`py-3 px-3 ${col.align === 'right' ? 'text-right' : ''} ${col.highlight && value < col.highlightThreshold ? 'text-red-600 font-semibold' : 'text-gray-700'
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
          <p className="text-sm opacity-90 font-medium">{icon} {title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        {trend !== undefined && (
          <div className={`text-xs px-2 py-1 rounded-full font-semibold ${trend >= 0 ? 'bg-white/20' : 'bg-red-400/30'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      {trendLabel && <p className="text-xs opacity-80 mt-2">{trendLabel}</p>}
    </div>
  );
};

// ==================== Main Component ====================

export default function Insights() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  
  // Initialize dateFrom/dateTo to 30 days ago - today
  const getInitialDates = () => {
    const now = moment.tz('Asia/Bangkok');
    const thirtyDaysAgo = now.clone().subtract(30, 'days');
    return {
      dateFrom: thirtyDaysAgo.format('YYYY-MM-DD'),
      dateTo: now.format('YYYY-MM-DD')
    };
  };
  
  const initialDates = getInitialDates();
  const [dateFrom, setDateFrom] = useState(initialDates.dateFrom);
  const [dateTo, setDateTo] = useState(initialDates.dateTo);
  const [useDateRange, setUseDateRange] = useState(true); // Start with date range to match 30-day API default
  const [metricsView, setMetricsView] = useState('category'); // 'category', 'brand', 'product'

  // Filters for detailed fast movers table
  const [detailFilterProduct, setDetailFilterProduct] = useState('');
  const [detailFilterCategory, setDetailFilterCategory] = useState('');
  const [detailFilterBrand, setDetailFilterBrand] = useState('');

  const fmtNumber = new Intl.NumberFormat('th-TH');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      // Load ALL products (no top limit) - filter topN on client side
      const url = useDateRange && dateFrom && dateTo
        ? `/inventory/insights?dateFrom=${dateFrom}&dateTo=${dateTo}`
        : `/inventory/insights?days=${days}`;
      
      const res = await api.get(url);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const isInitialMount = data === null;
    if (isInitialMount) {
      load();
    }
  }, []);

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

  const LoadingSection = ({ height = 'h-32' }) => (
    <div className={`bg-white rounded-xl shadow p-6 flex items-center justify-center ${height}`}>
      <div className="flex flex-col items-center gap-2">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-sm text-gray-500">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  const counts = data?.meta?.counts || {};

  // ✅ คำนวณ total จากทั้งหมดก่อน (ไม่ slice)
  const allFastMovers = (data?.fastMovers || []);
  const totalSold = allFastMovers.reduce((sum, f) => sum + (f.quantitySold || 0), 0);
  const avgDailyRate = allFastMovers.reduce((sum, f) => sum + (f.dailySalesRate || 0), 0);

  // จากนั้นค่อย map สำหรับการแสดงผล (ไม่ slice ที่นี้เพื่อให้ totals ถูกต้อง)
  const fastMoversData = allFastMovers.map(fm => ({
    label: `${fm.productName} (${fm.sku})`,
    productName: fm.productName,
    sku: fm.sku,
    quantitySold: fm.quantitySold,
    dailySalesRate: fm.dailySalesRate,
    // ✅ currentStock จาก API เป็น availableStock (รวม purchaseRemaining แล้ว)
    // stockOnHand = currentStock - purchaseRemaining (สต็อกจริงในคลัง)
    stockOnHand: (fm.currentStock || 0) - (fm.purchaseRemaining || 0),
    currentStock: fm.currentStock,
    incoming: fm.incoming || 0,
    purchaseRemaining: fm.purchaseRemaining || 0,
    daysRemaining: fm.daysRemaining,
    categoryName: fm.categoryName,
    brandName: fm.brandName,
  }));

  const categoryAnalysis = (data?.categorySummaries || []).map(cat => ({
    label: cat.categoryName,
    value: cat.totalSold,
    totalSold: cat.totalSold,
    totalStock: cat.totalStock,
    dailySalesRate: cat.dailySalesRate,
    daysRemaining: cat.daysRemaining,
    turnoverRate: cat.totalStock > 0 ? (cat.totalSold / cat.totalStock * 100) : 0,
  }));

  const brandAnalysis = (data?.brandSummaries || []).map(brand => ({
    label: brand.brandName,
    value: brand.totalSold,
    totalSold: brand.totalSold,
    totalStock: brand.totalStock,
    dailySalesRate: brand.dailySalesRate,
    daysRemaining: brand.daysRemaining,
    turnoverRate: brand.totalStock > 0 ? (brand.totalSold / brand.totalStock * 100) : 0,
  }));

  const reorderData = (data?.reorderSuggestions || []).map(item => ({
    ...item,
    // ✅ currentStock จาก API เป็น availableStock (รวม purchaseRemaining แล้ว)
    // stockOnHand ต้องเป็นสต็อกจริง = currentStock - purchaseRemaining
    stockOnHand: (item.currentStock || 0) - (item.purchaseRemaining || 0),
    urgency: item.daysUntilStockOut <= 7 ? 'ด่วนมาก' : item.daysUntilStockOut <= 14 ? 'ด่วน' : 'ปกติ',
    urgencyColor: item.daysUntilStockOut <= 7 ? 'bg-red-100 text-red-700' : item.daysUntilStockOut <= 14 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700',
  }))
    .filter(item => item.enableStockAlerts !== false);

  const deadStockData = (data?.deadStock || []).map(ds => ({
    label: `${ds.productName} (${ds.sku})`,
    productId: ds.productId,
    productName: ds.productName,
    sku: ds.sku,
    quantitySold: ds.quantitySold || 0,
    dailySalesRate: ds.dailySalesRate || 0,
    // currentStock (backend) = stockOnHand + purchaseRemaining (total)
    currentStock: ds.currentStock,
    stockOnHand: (ds.currentStock || 0) - (ds.purchaseRemaining || 0),
    purchaseRemaining: ds.purchaseRemaining || 0,
    categoryName: ds.categoryName,
    brandName: ds.brandName,
  }));

  const lowStockData = (data?.lowStock || []);
  const nearExpiryData = (data?.nearExpiry || []).map(item => ({
    productName: item.productName,
    sku: item.sku,
    batchRef: item.batchRef || 'ไม่ระบุ',
    quantity: item.quantity,
    expiryDate: item.expiryDate,
    daysLeft: Math.ceil((new Date(item.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)),
  }));

  // สร้าง product-level metrics (รวมทุก variants ของสินค้า)
  // ✅ ใช้ข้อมูลทั้งหมดจาก API (ไม่ filter topN ตรงนี้)
  const productMetrics = (() => {
    const productMap = new Map(); // productId -> { productName, totalSold, totalStock, dailySalesRate, ... }

    // Helper function: เพิ่มข้อมูลสินค้าเข้า productMap
    const addProductToMap = (productId, productName, categoryName, brandName, quantitySold, currentStock, incoming, dailySalesRate) => {
      const key = String(productId);
      if (!productMap.has(key)) {
        productMap.set(key, {
          label: productName,
          productName: productName,
          productId: productId,
          categoryName: categoryName,
          brandName: brandName,
          totalSold: 0,
          totalStock: 0,
          totalIncoming: 0,
          dailySalesRate: 0,
          variantCount: 0,
        });
      }
      const product = productMap.get(key);
      product.totalSold += quantitySold || 0;
      // ✅ ใช้ stockOnHand (currentStock - incoming) เพื่อให้ตรงกับ Dashboard
      const stockOnHand = (currentStock || 0) - (incoming || 0);
      product.totalStock += stockOnHand;
      product.totalIncoming += incoming || 0;
      product.dailySalesRate += dailySalesRate || 0;
      product.variantCount++;
    };

    // ✅ รวบรวมข้อมูลจากทุกสินค้า (ไม่ filter topN)
    const allFastMovers = data?.fastMovers || [];
    const allLowStock = data?.lowStock || [];
    const allDeadStock = data?.deadStock || [];
    const allReorder = data?.reorderSuggestions || [];

    // ✅ สร้าง variant-level map เพื่อรวมทุก variants ของแต่ละ product
    const variantMap = new Map(); // variantId -> variant data
    
    // รวบรวม variants จากทุก sources
    allFastMovers.forEach(fm => {
      const vKey = String(fm.variantId);
      if (!variantMap.has(vKey)) {
        variantMap.set(vKey, {
          productId: fm.productId,
          productName: fm.productName,
          categoryName: fm.categoryName,
          brandName: fm.brandName,
          variantId: fm.variantId,
          quantitySold: fm.quantitySold || 0,
          currentStock: fm.currentStock || 0,
          incoming: fm.incoming || 0,
          dailySalesRate: fm.dailySalesRate || 0,
        });
      }
    });
    
    allLowStock.forEach(ls => {
      const vKey = String(ls.variantId);
      if (!variantMap.has(vKey)) {
        variantMap.set(vKey, {
          productId: ls.productId,
          productName: ls.productName,
          categoryName: '',
          brandName: '',
          variantId: ls.variantId,
          quantitySold: 0,
          currentStock: ls.availableStock || ls.stockOnHand || 0, // availableStock = stockOnHand + incoming
          incoming: ls.incoming || 0,
          dailySalesRate: 0,
        });
      }
    });
    
    allDeadStock.forEach(ds => {
      const vKey = String(ds.variantId);
      if (!variantMap.has(vKey)) {
        variantMap.set(vKey, {
          productId: ds.productId,
          productName: ds.productName,
          categoryName: ds.categoryName,
          brandName: ds.brandName,
          variantId: ds.variantId,
          quantitySold: ds.quantitySold || 0,
          currentStock: ds.currentStock || 0,
          incoming: ds.incoming || 0,
          dailySalesRate: ds.dailySalesRate || 0,
        });
      }
    });
    
    allReorder.forEach(rd => {
      const vKey = String(rd.variantId);
      if (!variantMap.has(vKey)) {
        variantMap.set(vKey, {
          productId: rd.productId,
          productName: rd.productName,
          categoryName: '',
          brandName: '',
          variantId: rd.variantId,
          quantitySold: rd.quantitySold || 0,
          currentStock: rd.currentStock || 0,
          incoming: rd.incoming || 0,
          dailySalesRate: rd.avgDailySales || 0,
        });
      }
    });
    
    // ✅ ตอนนี้รวม variants เข้าไปใน products
    variantMap.forEach(variant => {
      addProductToMap(
        variant.productId,
        variant.productName,
        variant.categoryName,
        variant.brandName,
        variant.quantitySold,
        variant.currentStock,
        variant.incoming,
        variant.dailySalesRate
      );
    });

    return Array.from(productMap.values())
      .map(p => ({
        ...p,
        turnoverRate: p.totalStock > 0 ? (p.totalSold / p.totalStock * 100) : 0,
        daysRemaining: p.dailySalesRate > 0 ? p.totalStock / p.dailySalesRate : 999999,
      }))
      .sort((a, b) => b.totalSold - a.totalSold);
  })();

  // เลือก metrics ตามการเลือก view
  const metricsDataToDisplay =
    metricsView === 'product' ? productMetrics :
      metricsView === 'brand' ? brandAnalysis :
        categoryAnalysis;

  const metricsTitle =
    metricsView === 'product' ? '📦 ตัวชี้วัด: รายสินค้า' :
      metricsView === 'brand' ? '🏷️ ตัวชี้วัด: แบรนด์' :
        '📁 ตัวชี้วัด: หมวดหมู่';

  const criticalItems = reorderData.filter(r => r.daysUntilStockOut <= 7).length;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">📈 Insights & Analytics</h1>
          <p className="text-gray-500 text-sm mt-1">วิเคราะห์เชิงลึก{useDateRange ? ` (${dateFrom} ถึง ${dateTo})` : ` (${days} วันย้อนหลัง)`}</p>
          <p className="text-blue-600 text-xs mt-1">💡 <strong>หมายเหตุ:</strong> ยอดขาย = ช่วงวันที่ที่เลือก | สต็อก = ปัจจุบัน ณ วันนี้</p>
        </div>
      </div>

      {/* Filter Section - Full Width */}
      <div className="bg-white rounded-xl shadow p-6">
        <DateRangeFilter
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
          useDateRange={useDateRange}
          setUseDateRange={setUseDateRange}
          onSearch={load}
        />
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
            <StatCardTrend title="ขายทั้งหมด" value={fmtNumber.format(totalSold)} icon="📦" color="blue" trendLabel={useDateRange ? `${dateFrom} - ${dateTo}` : `${days} วันที่ผ่านมา`} />
            <StatCardTrend title="ขายเฉลี่ย/วัน" value={fmtNumber.format(Math.round(avgDailyRate))} icon="📊" color="green" trendLabel="ทุกสินค้ารวม" />
            <StatCardTrend title="สินค้าขายดี" value={fmtNumber.format(counts.fastMovers || 0)} icon="🔥" color="purple" />
            <StatCardTrend title="ต้องสั่งเติม" value={fmtNumber.format(counts.reorderSuggestions || 0)} icon="🛒" color="amber" />
            <StatCardTrend title="สต็อกวิกฤต" value={fmtNumber.format(criticalItems)} icon="🚨" color="red" trendLabel="เหลือ < 7 วัน" />
            <StatCardTrend title="ใกล้หมดอายุ" value={fmtNumber.format(counts.nearExpiry || 0)} icon="⏰" color="amber" />
          </>
        )}
      </div>

      {/* Inventory Health Gauges */}
      {loading ? (
        <LoadingSection height="h-64" />
      ) : (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">🏥 Inventory Health Metrics</h3>
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
              value={Math.round(avgDailyRate)}
              max={Math.max(100, Math.round(avgDailyRate))}
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
      )}

      {/* Sales Analysis Section - Top Fast Movers Expandable Table */}
      {loading ? (
        <LoadingSection height="h-96" />
      ) : (
        <ExpandableFastMoversTable
          data={allFastMovers}
          title={`🔥 สินค้าขายดีทั้งหมด`}
          columns="sales"
        />
      )}

      {/* Dead Stock Chart - Expandable Table */}
      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <LoadingSection height="h-96" />
        ) : (
          <ExpandableFastMoversTable
            data={deadStockData}
            title={`📭 สินค้าขายไม่ออก (Dead Stock)`}
            columns="stock"
          />
        )}
      </div>

      {/* Category & Brand Analysis with Pie Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading ? (
          <>
            <LoadingSection height="h-96" />
            <LoadingSection height="h-96" />
          </>
        ) : (
          <>
            <PieChart
              data={categoryAnalysis}
              title="📁 ยอดขายตามหมวดหมู่"
              dataKey="totalSold"
              labelKey="label"
            />
            <PieChart
              data={brandAnalysis}
              title="🏷️ ยอดขายตามแบรนด์"
              dataKey="totalSold"
              labelKey="label"
            />
          </>
        )}
      </div>

      {/* Stock Days Remaining Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading ? (
          <>
            <LoadingSection height="h-96" />
            <LoadingSection height="h-96" />
          </>
        ) : (
          <>
            <HBarChart
              data={fastMoversData.sort((a, b) => b.dailySalesRate - a.dailySalesRate)}
              title="📈 อัตราขายสูงสุด (ต่อวัน)"
              valueKey="dailySalesRate"
              color="#3B82F6"
            />
            <HBarChart
              data={fastMoversData.filter(f => f.daysRemaining < 999).sort((a, b) => a.daysRemaining - b.daysRemaining)}
              title="⚠️ สินค้าที่เหลือใช้ได้น้อย (วัน)"
              valueKey="daysRemaining"
              color="#F59E0B"
            />
          </>
        )}
      </div>

      {/* Near Expiry Alert + Metrics Table */}

      {loading ? (
        <LoadingSection height="h-96" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Near Expiry Alert Card */}
          <div className="space-y-6">
            {nearExpiryData.length > 0 && (
              <AlertCard
                severity="critical"
                title="ใกล้หมดอายุ"
                items={nearExpiryData}
                columns={[
                  { label: '📦 สินค้า', key: 'productName' },
                  { label: '🏷️ SKU', key: 'sku' },
                  { label: '🎫 ล็อต', key: 'batchRef' },
                  { label: '📊 จำนวน (ชิ้น)', key: 'quantity', align: 'right', format: 'number' },
                  { label: '⏰ เหลือ (วัน)', key: 'daysLeft', align: 'right' },
                ]}
              />
            )}
          </div>

          {/* Right: Metrics Table */}
          <div className="space-y-4">
            {/* View Type Toggle */}
            <div className="bg-white rounded-xl shadow p-4">
              <label className="block text-sm font-semibold text-gray-700 mb-3">เลือกแสดงตัวชี้วัด:</label>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setMetricsView('category')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${metricsView === 'category'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  📁 หมวดหมู่
                </button>
                <button
                  onClick={() => setMetricsView('brand')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${metricsView === 'brand'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  🏷️ แบรนด์
                </button>
                <button
                  onClick={() => setMetricsView('product')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${metricsView === 'product'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  📦 รายสินค้า
                </button>
              </div>
            </div>

            {/* Metrics Table */}
            <DataTable
              data={metricsDataToDisplay}
              title={metricsTitle}
              columns={[
                { key: 'label', label: metricsView === 'product' ? 'สินค้า' : metricsView === 'brand' ? 'แบรนด์' : 'หมวดหมู่' },
                { key: 'totalSold', label: 'ขาย', format: 'number', align: 'right' },
                { key: 'totalStock', label: 'คงเหลือ', format: 'number', align: 'right' },
                { key: 'turnoverRate', label: 'Turnover', format: 'percent', align: 'right' },
                { key: 'daysRemaining', label: 'เหลือ', format: 'days', align: 'right', highlight: true, highlightThreshold: 14 },
              ]}
            />
          </div>
        </div>
      )}

      {/* Reorder Suggestions Table */}
      {reorderData.length > 0 && (
        loading ? (
          <LoadingSection height="h-96" />
        ) : (
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">🛒 แนะนำการสั่งซื้อ</h3>
                <p className="text-xs text-gray-500 mt-1">💡 สำหรับการแบ่ง MOQ ตามแต่ละ Variant ให้ดูที่หน้า <strong>📦 Replenishment</strong></p>
              </div>
              <div className="flex gap-2 text-xs flex-wrap">
                <span className="px-3 py-1 bg-red-100 text-red-700 rounded-lg font-medium">🚨 ด่วนมาก ≤7 วัน</span>
                <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg font-medium">⚠️ ด่วน ≤14 วัน</span>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg font-medium">ℹ️ ปกติ</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b-2 border-gray-300">
                    <th className="py-3 px-3 text-left font-semibold text-gray-700">ความเร่งด่วน</th>
                    <th className="py-3 px-3 text-left font-semibold text-gray-700">สินค้า</th>
                    <th className="py-3 px-3 text-left font-semibold text-gray-700">SKU</th>
                    <th className="py-3 px-3 text-right font-semibold text-gray-700">มี</th>
                    <th className="py-3 px-3 text-right font-semibold text-gray-700">ค้าง</th>
                    <th className="py-3 px-3 text-right font-semibold text-gray-700">รวม</th>
                    <th className="py-3 px-3 text-right font-semibold text-gray-700">ขาย/วัน</th>
                    <th className="py-3 px-3 text-right font-semibold text-gray-700">เหลือใช้</th>
                    <th className="py-3 px-3 text-center font-semibold text-gray-700">Lead Time+Buffer</th>
                    <th className="py-3 px-3 text-right font-semibold text-gray-700">จุดสั่ง</th>
                    <th className="py-3 px-3 text-right font-semibold text-gray-700">แนะนำสั่ง</th>
                  </tr>
                </thead>
                <tbody>
                  {reorderData.slice(0, 15).map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-blue-50 transition">
                      <td className="py-3 px-3">
                        <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${item.urgencyColor}`}>
                          {item.urgency}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-700 font-medium">{item.productName}</td>
                      <td className="py-3 px-3 font-mono text-gray-500 text-xs">{item.sku}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{fmtNumber.format(item.stockOnHand || 0)}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{fmtNumber.format(item.purchaseRemaining || 0)}</td>
                      <td className="py-3 px-3 text-right text-gray-700 font-medium" style={{color: (item.currentStock || item.availableStock) >= item.suggestedReorderPoint ? '#10B981' : '#EF4444'}}>{fmtNumber.format(item.currentStock || item.availableStock || 0)}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{item.dailySalesRate.toFixed(1)}</td>
                      <td className={`py-3 px-3 text-right font-semibold ${item.daysUntilStockOut <= 7 ? 'text-red-600' : item.daysUntilStockOut <= 14 ? 'text-amber-600' : 'text-gray-600'}`}>
                        {Math.round(item.daysUntilStockOut)} วัน
                      </td>
                      <td className="py-3 px-3 text-center text-gray-700">{item.leadTimeDays}+{item.bufferDays} = {item.leadTimeDays+item.bufferDays} วัน</td>
                      <td className="py-3 px-3 text-right text-gray-700 font-medium">{fmtNumber.format(item.suggestedReorderPoint)}</td>
                      <td className={`py-3 px-3 text-right font-bold ${item.daysUntilStockOut <= 7 ? 'text-red-600' : item.daysUntilStockOut <= 14 ? 'text-amber-600' : 'text-gray-600'}`}>
                        <span className={item.urgencyColor}>{fmtNumber.format(item.recommendedOrderQty)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Detailed Analysis Table */}
      {loading ? (
        <LoadingSection height="h-96" />
      ) : (() => {
        // Unique filter options
        const uniqueCategories = [...new Set(fastMoversData.map(f => f.categoryName).filter(Boolean))].sort();
        const uniqueBrands = [...new Set(fastMoversData.map(f => f.brandName).filter(Boolean))].sort();

        // Apply filters
        const filteredFastMovers = fastMoversData.filter(item => {
          if (detailFilterProduct && !item.productName?.toLowerCase().includes(detailFilterProduct.toLowerCase()) && !item.sku?.toLowerCase().includes(detailFilterProduct.toLowerCase())) return false;
          if (detailFilterCategory && item.categoryName !== detailFilterCategory) return false;
          if (detailFilterBrand && item.brandName !== detailFilterBrand) return false;
          return true;
        });

        return (
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">📋 รายละเอียดสินค้าขายดี ({filteredFastMovers.length} รายการ)</h3>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <input
                type="text"
                placeholder="ค้นหาสินค้า / SKU..."
                value={detailFilterProduct}
                onChange={e => setDetailFilterProduct(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <select
                value={detailFilterCategory}
                onChange={e => setDetailFilterCategory(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">ทุกหมวดหมู่</option>
                {uniqueCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <select
                value={detailFilterBrand}
                onChange={e => setDetailFilterBrand(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">ทุกแบรนด์</option>
                {uniqueBrands.map(brand => <option key={brand} value={brand}>{brand}</option>)}
              </select>
              {(detailFilterProduct || detailFilterCategory || detailFilterBrand) && (
                <button
                  onClick={() => { setDetailFilterProduct(''); setDetailFilterCategory(''); setDetailFilterBrand(''); }}
                  className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition font-medium"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>
            <DataTable
              data={filteredFastMovers}
              title=""
              columns={[
                { key: 'productName', label: 'สินค้า' },
                { key: 'sku', label: 'SKU' },
                { key: 'categoryName', label: 'หมวดหมู่' },
                { key: 'brandName', label: 'แบรนด์' },
                { key: 'quantitySold', label: 'ขายแล้ว', format: 'number', align: 'right' },
                { key: 'dailySalesRate', label: '/วัน', format: 'number', align: 'right' },
                { key: 'stockOnHand', label: 'มีอยู่', format: 'number', align: 'right' },
                { key: 'purchaseRemaining', label: 'ค้างรับ', format: 'number', align: 'right' },
                { key: 'currentStock', label: 'รวม', format: 'number', align: 'right' },
                { key: 'daysRemaining', label: 'เหลือใช้', format: 'days', align: 'right', highlight: true, highlightThreshold: 14 },
              ]}
            />
          </div>
        );
      })()}
    </div>
  );
}
