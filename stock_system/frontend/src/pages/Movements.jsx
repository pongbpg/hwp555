import { useEffect, useState } from 'react';
import api from '../api.js';

const TYPE_LABELS = {
  in: '📥 รับเข้า',
  out: '📤 จ่ายออก',
  adjust: '🔄 ปรับปรุง',
  transfer: '🔀 โอนย้าย',
  return: '↩️ รับคืน',
  damage: '💔 เสียหาย',
  expired: '⏰ หมดอายุ',
};

export default function Movements() {
  const [movements, setMovements] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filterType, setFilterType] = useState('');
  const [filterSku, setFilterSku] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const fmtNumber = new Intl.NumberFormat('th-TH');
  const fmtDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const loadMovements = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 50 });
      if (filterType) params.append('movementType', filterType);
      if (filterSku) params.append('sku', filterSku);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await api.get(`/movements?${params}`);
      setMovements(res.data.movements || []);
      setPagination(res.data.pagination || { page: 1, totalPages: 1, total: 0 });
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

  const loadProducts = async () => {
    try {
      const res = await api.get('/products?status=active');
      setProducts(res.data || []);
    } catch (err) {
      console.error('Failed to load products');
    }
  };

  useEffect(() => {
    loadMovements();
  }, []);

  const handleFilter = (e) => {
    e.preventDefault();
    loadMovements(1);
  };

  const clearFilters = () => {
    setFilterType('');
    setFilterSku('');
    setStartDate('');
    setEndDate('');
    loadMovements(1);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">📦 การเคลื่อนไหวสต็อก</h1>
        <div className="text-xs sm:text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          💡 ปรับปรุงสต็อก: ใช้หน้า <strong>Orders</strong> (ประเภท: Adjustment, Damage, Expired, Return)
        </div>
      </div>

      {/* Filters */}
      <form onSubmit={handleFilter} className="bg-white rounded-xl shadow p-3 sm:p-4">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 items-end">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs text-gray-500 mb-1">ประเภท</label>
            <select
              className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">ทั้งหมด</option>
              {Object.entries(TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">รหัสสินค้า</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              value={filterSku}
              onChange={(e) => setFilterSku(e.target.value)}
              placeholder="SKU..."
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">จากวันที่</label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ถึงวันที่</label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex gap-2 col-span-2 sm:col-span-1">
            <button type="submit" className="flex-1 sm:flex-none bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm">
              🔍 ค้นหา
            </button>
            <button
              type="button"
              className="flex-1 sm:flex-none bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm"
              onClick={clearFilters}
            >
              ล้าง
            </button>
          </div>
        </div>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl shadow p-3 sm:p-6">
        {loading ? (
          <p className="text-gray-600">กำลังโหลด...</p>
        ) : movements.length === 0 ? (
          <p className="text-center text-gray-500 py-8">ไม่พบรายการ</p>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="block sm:hidden space-y-2 mb-4">
              {movements.map((m) => (
                <div key={m._id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-gray-800 truncate">{m.productName}</p>
                      <p className="font-mono text-xs text-gray-500">{m.sku}</p>
                    </div>
                    <span className={`text-sm font-semibold flex-shrink-0 ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {m.quantity > 0 ? '+' : ''}{fmtNumber.format(m.quantity)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{TYPE_LABELS[m.movementType] || m.movementType}</span>
                    <span>{fmtDate(m.createdAt)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>ก่อน: {fmtNumber.format(m.previousStock)} → หลัง: {fmtNumber.format(m.newStock)}</span>
                    <span>{m.createdByName || '-'}</span>
                  </div>
                  {(m.reason || m.notes) && (
                    <p className="text-xs text-gray-500 mt-1 truncate">{m.reason || m.notes}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">วันที่/เวลา</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">ประเภท</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">สินค้า</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">รหัส</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">จำนวน</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">ก่อน</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">หลัง</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">เหตุผล</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">ผู้ดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m._id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-sm whitespace-nowrap">{fmtDate(m.createdAt)}</td>
                      <td className="py-2 px-3 text-sm">{TYPE_LABELS[m.movementType] || m.movementType}</td>
                      <td className="py-2 px-3 text-sm text-gray-800">{m.productName}</td>
                      <td className="py-2 px-3 text-sm font-mono text-gray-600">{m.sku}</td>
                      <td
                        className={`py-2 px-3 text-sm text-right font-semibold ${
                          m.quantity > 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {m.quantity > 0 ? '+' : ''}
                        {fmtNumber.format(m.quantity)}
                      </td>
                      <td className="py-2 px-3 text-sm text-right text-gray-600">{fmtNumber.format(m.previousStock)}</td>
                      <td className="py-2 px-3 text-sm text-right text-gray-600">{fmtNumber.format(m.newStock)}</td>
                      <td className="py-2 px-3 text-sm text-gray-600">{m.reason || m.notes || '-'}</td>
                      <td className="py-2 px-3 text-sm text-gray-600">{m.createdByName || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex justify-between items-center mt-4">
              <span className="text-sm text-gray-500">
                แสดง {movements.length} จาก {pagination.total} รายการ
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded-lg text-sm disabled:opacity-50"
                  onClick={() => loadMovements(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                >
                  ก่อนหน้า
                </button>
                <span className="text-sm text-gray-600 px-2">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded-lg text-sm disabled:opacity-50"
                  onClick={() => loadMovements(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
