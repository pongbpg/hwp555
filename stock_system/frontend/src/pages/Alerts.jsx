import { useEffect, useState } from 'react';
import api from '../api.js';

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [filterType, setFilterType] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');

  const fmtNumber = new Intl.NumberFormat('th-TH');
  const fmtDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/inventory/alerts?days=${days}`);
      setAlerts(res.data.alerts || []);
      setCounts(res.data.counts || {});
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
    loadAlerts();
  }, [days]);

  const filteredAlerts = alerts.filter((alert) => {
    if (filterType && alert.type !== filterType) return false;
    if (filterSeverity && alert.severity !== filterSeverity) return false;
    return true;
  });

  const groupedAlerts = (() => {
    const map = {};
    for (const a of filteredAlerts) {
      if (!map[a.sku]) {
        map[a.sku] = { sku: a.sku, productName: a.productName, alerts: [] };
      }
      map[a.sku].alerts.push(a);
    }
    return Object.values(map);
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-800">🔔 การแจ้งเตือน</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">ใกล้หมดอายุ (วัน)</label>
          <select
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>7</option>
            <option value={15}>15</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
            <option value={90}>90</option>
          </select>
          <button
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors"
            onClick={loadAlerts}
          >
            🔄 รีเฟรช
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 p-4 rounded-lg flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <span>{error}</span>
          <button onClick={() => loadAlerts()} className="ml-auto bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded text-sm">
            🔄 ลองใหม่
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <p className="text-sm text-indigo-600">ทั้งหมด</p>
          <p className="text-2xl font-bold text-indigo-700">{counts.total || 0}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-600">ด่วน</p>
          <p className="text-2xl font-bold text-red-700">{counts.critical || 0}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-600">เตือน</p>
          <p className="text-2xl font-bold text-amber-700">{counts.warning || 0}</p>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <p className="text-sm text-rose-600">หมดสต็อก</p>
          <p className="text-2xl font-bold text-rose-700">{counts.outOfStock || 0}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="text-sm text-orange-600">สต็อกต่ำ</p>
          <p className="text-2xl font-bold text-orange-700">{counts.lowStock || 0}</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-sm text-yellow-600">ใกล้หมดอายุ</p>
          <p className="text-2xl font-bold text-yellow-700">{counts.nearExpiry || 0}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">ประเภท</label>
          <select
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">ทั้งหมด</option>
            <option value="out-of-stock">❌ หมดสต็อก</option>
            <option value="low-stock">⚠️ สต็อกต่ำ</option>
            <option value="near-expiry">⏰ ใกล้หมดอายุ</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ระดับ</label>
          <select
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
          >
            <option value="">ทั้งหมด</option>
            <option value="critical">🔴 ด่วน</option>
            <option value="warning">🟡 เตือน</option>
          </select>
        </div>
        {(filterType || filterSeverity) && (
          <button
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors"
            onClick={() => {
              setFilterType('');
              setFilterSeverity('');
            }}
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* Alerts Table */}
      <div className="bg-white rounded-xl shadow p-6">
        {loading ? (
          <p className="text-gray-600">กำลังโหลด...</p>
        ) : filteredAlerts.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">✅</div>
            <p className="text-xl font-semibold text-green-600">ไม่มีการแจ้งเตือน</p>
            <p className="text-gray-500">สต็อกอยู่ในระดับปกติ</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">ระดับ</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">ประเภท</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">สินค้า</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">รหัส</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {groupedAlerts.map((group, idx) => {
                  const highestSeverity = group.alerts.some((a) => a.severity === 'critical') ? 'critical' : 'warning';
                  const types = Array.from(new Set(group.alerts.map((a) => a.type))).join(' / ');
                  return (
                    <tr
                      key={group.sku + '_' + idx}
                      className={`border-b border-gray-100 hover:bg-gray-50 ${
                        highestSeverity === 'critical' ? 'bg-red-50' : ''
                      }`}
                    >
                      <td className="py-2 px-3 align-top">
                        <span
                          className={`text-xs px-2 py-1 rounded font-medium ${
                            highestSeverity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {highestSeverity === 'critical' ? '🔴 ด่วน' : '🟡 เตือน'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-sm align-top">{types}</td>
                      <td className="py-2 px-3 text-sm font-medium text-gray-800 align-top">{group.productName}</td>
                      <td className="py-2 px-3 text-sm font-mono text-gray-600 align-top">{group.sku}</td>
                      <td className="py-2 px-3 text-sm text-gray-700">
                        <div className="space-y-1">
                          {group.alerts.map((alert, i) => (
                            <div key={i} className="p-2 rounded-md bg-gray-50">
                              <div className="flex items-start gap-2">
                                <div className="w-6 pt-0.5">
                                  {alert.type === 'out-of-stock' && <span>❌</span>}
                                  {alert.type === 'low-stock' && <span>⚠️</span>}
                                  {alert.type === 'near-expiry' && <span>⏰</span>}
                                </div>
                                <div className="flex-1">
                                  {alert.type === 'out-of-stock' && <span className="text-red-600">สต็อกหมด</span>}
                                  {alert.type === 'low-stock' && (
                                    <span>
                                      สต็อก: <strong>{fmtNumber.format(alert.stockOnHand)}</strong> / จุดสั่งซื้อ:{' '}
                                      <strong>{fmtNumber.format(alert.reorderPoint)}</strong>
                                    </span>
                                  )}
                                  {alert.type === 'near-expiry' && (
                                    <span>
                                      หมดอายุ: <strong>{fmtDate(alert.expiryDate)}</strong> (
                                      <span className={alert.daysLeft <= 7 ? 'text-red-600' : 'text-amber-600'}>
                                        เหลือ {alert.daysLeft} วัน
                                      </span>
                                      ) | ล็อต: {alert.batchRef || '-'} | จำนวน: {fmtNumber.format(alert.quantity)}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500">{alert.severity === 'critical' ? 'ด่วน' : 'เตือน'}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Export Button */}
        {filteredAlerts.length > 0 && (
          <div className="mt-4 text-right">
            <button
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors"
              onClick={() => {
                const headers = ['ระดับ', 'ประเภท', 'สินค้า', 'รหัส', 'ข้อความ'];
                const rows = filteredAlerts.map((a) => [
                  a.severity === 'critical' ? 'ด่วน' : 'เตือน',
                  a.type === 'out-of-stock' ? 'หมดสต็อก' : a.type === 'low-stock' ? 'สต็อกต่ำ' : 'ใกล้หมดอายุ',
                  a.productName,
                  a.sku,
                  a.message,
                ]);
                const csvContent = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
                const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `alerts_${new Date().toISOString().split('T')[0]}.csv`;
                link.click();
              }}
            >
              📥 Export CSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
