import { useEffect, useState } from 'react';
import api from '../api.js';

export default function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [movements, setMovements] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fmtNumber = new Intl.NumberFormat('th-TH');
  const fmtCurrency = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });

  const loadData = async () => {
    setLoading(true);
    try {
      const [dashRes, alertRes, moveRes] = await Promise.all([
        api.get('/inventory/dashboard'),
        api.get('/inventory/alerts?days=30'),
        api.get('/movements/summary?days=7'),
      ]);
      setDashboard(dashRes.data);
      setAlerts(alertRes.data);
      setMovements(moveRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow p-6">
        <p className="text-gray-600">กำลังโหลด...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow p-6">
        <p className="text-red-600 mb-4">{error}</p>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg" onClick={loadData}>
          ลองอีกครั้ง
        </button>
      </div>
    );
  }

  const summary = dashboard?.summary || {};
  const alertCounts = alerts?.counts || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">📊 Dashboard</h1>
        <button
          onClick={loadData}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors"
        >
          🔄 รีเฟรช
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">สินค้าทั้งหมด</p>
          <p className="text-2xl font-bold text-gray-800">{fmtNumber.format(summary.totalProducts || 0)}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-indigo-500">
          <p className="text-sm text-gray-500">รายการสินค้า</p>
          <p className="text-2xl font-bold text-gray-800">{fmtNumber.format(summary.totalVariants || 0)}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-500">สต็อกรวม</p>
          <p className="text-2xl font-bold text-gray-800">{fmtNumber.format(summary.totalStock || 0)}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-purple-500">
          <p className="text-sm text-gray-500">มูลค่าสต็อก</p>
          <p className="text-2xl font-bold text-gray-800">{fmtCurrency.format(summary.totalValue || 0)}</p>
        </div>
      </div>

      {/* Alert Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-600">สินค้าหมด</p>
          <p className="text-2xl font-bold text-red-700">{summary.outOfStockCount || 0}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-600">สต็อกต่ำ</p>
          <p className="text-2xl font-bold text-amber-700">{summary.lowStockCount || 0}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-600">ใบสั่งซื้อรอรับ</p>
          <p className="text-2xl font-bold text-blue-700">{summary.pendingOrders || 0}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-sm text-green-600">ใบสั่งวันนี้</p>
          <p className="text-2xl font-bold text-green-700">{summary.ordersToday || 0}</p>
        </div>
      </div>

      {/* Alerts */}
      {alertCounts.total > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold text-gray-800">🔔 การแจ้งเตือน</h2>
            {alertCounts.critical > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                {alertCounts.critical} ด่วน
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">ระดับ</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">ประเภท</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">ข้อความ</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">รหัสสินค้า</th>
                </tr>
              </thead>
              <tbody>
                {(alerts?.alerts || []).slice(0, 10).map((alert, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          alert.severity === 'critical'
                            ? 'bg-red-100 text-red-700 border border-red-200'
                            : 'bg-amber-100 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {alert.severity === 'critical' ? 'ด่วน' : 'เตือน'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sm">
                      {alert.type === 'out-of-stock' && '❌ หมดสต็อก'}
                      {alert.type === 'low-stock' && '⚠️ สต็อกต่ำ'}
                      {alert.type === 'near-expiry' && '⏰ ใกล้หมดอายุ'}
                    </td>
                    <td className="py-2 px-3 text-sm text-gray-700">{alert.message}</td>
                    <td className="py-2 px-3 text-sm font-mono text-gray-600">{alert.sku}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(alerts?.alerts || []).length > 10 && (
            <p className="text-center text-gray-500 mt-4 text-sm">และอีก {alerts.alerts.length - 10} รายการ</p>
          )}
        </div>
      )}

      {/* Movement Summary */}
      {movements && movements.byType?.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">📦 การเคลื่อนไหวสต็อก (7 วันล่าสุด)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {(movements.byType || []).map((item) => (
              <div key={item._id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-sm text-gray-500">
                  {item._id === 'in' && '📥 รับเข้า'}
                  {item._id === 'out' && '📤 จ่ายออก'}
                  {item._id === 'adjust' && '🔄 ปรับปรุง'}
                  {item._id === 'return' && '↩️ รับคืน'}
                  {item._id === 'damage' && '💔 เสียหาย'}
                  {item._id === 'expired' && '⏰ หมดอายุ'}
                </p>
                <p className="text-xl font-bold text-gray-800">{fmtNumber.format(item.count)}</p>
                <p className="text-xs text-gray-400">{fmtNumber.format(Math.abs(item.totalQuantity))} ชิ้น</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stock by Category */}
      {dashboard?.byCategory?.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">📁 สต็อกตามหมวดหมู่</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">หมวดหมู่</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">จำนวนรายการ</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">สต็อก</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">มูลค่า</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.byCategory.slice(0, 10).map((cat, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-sm text-gray-800">{cat.name}</td>
                    <td className="py-2 px-3 text-sm text-gray-600 text-right">{fmtNumber.format(cat.count)}</td>
                    <td className="py-2 px-3 text-sm text-gray-600 text-right">{fmtNumber.format(cat.stock)}</td>
                    <td className="py-2 px-3 text-sm text-gray-600 text-right">{fmtCurrency.format(cat.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock by Brand */}
      {dashboard?.byBrand?.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">🏷️ สต็อกตามแบรนด์</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">แบรนด์</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">จำนวนรายการ</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">สต็อก</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">มูลค่า</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.byBrand.slice(0, 10).map((brand, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-sm text-gray-800">{brand.name}</td>
                    <td className="py-2 px-3 text-sm text-gray-600 text-right">{fmtNumber.format(brand.count)}</td>
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
  );
}
