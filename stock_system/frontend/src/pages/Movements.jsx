import { useEffect, useState } from 'react';
import api from '../api.js';
import SearchableSelect from '../components/SearchableSelect.jsx';

const MOVEMENT_TYPES = [
  { value: 'adjust', label: '🔄 ปรับปรุงสต็อก' },
  { value: 'damage', label: '💔 เสียหาย/ชำรุด' },
  { value: 'expired', label: '⏰ หมดอายุ' },
  { value: 'return', label: '↩️ รับคืนจากลูกค้า' },
];

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

  const [showForm, setShowForm] = useState(false);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [formData, setFormData] = useState({
    movementType: 'adjust',
    quantity: '',
    reason: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

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
      setError(err.response?.data?.error || 'Failed to load movements');
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
    loadProducts();
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

  const handleProductChange = (productId) => {
    const product = products.find((p) => p._id === productId);
    setSelectedProduct(product || null);
    setSelectedVariant(null);
    if (product && product.variants?.length > 0) {
      setSelectedVariant(product.variants[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProduct || !selectedVariant) {
      setError('กรุณาเลือกสินค้า');
      return;
    }
    if (!formData.quantity || formData.quantity === 0) {
      setError('กรุณาระบุจำนวน');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await api.post('/movements', {
        productId: selectedProduct._id,
        variantId: selectedVariant._id,
        sku: selectedVariant.sku,
        movementType: formData.movementType,
        quantity: Number(formData.quantity),
        reason: formData.reason,
        notes: formData.notes,
      });

      setShowForm(false);
      setSelectedProduct(null);
      setSelectedVariant(null);
      setFormData({ movementType: 'adjust', quantity: '', reason: '', notes: '' });
      loadMovements(1);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create movement');
    } finally {
      setSaving(false);
    }
  };

  const getNewStock = () => {
    if (!selectedVariant || !formData.quantity) return null;
    const current = selectedVariant.stockOnHand || 0;
    const qty = Number(formData.quantity);
    if (formData.movementType === 'adjust') return current + qty;
    if (['damage', 'expired'].includes(formData.movementType)) return current - Math.abs(qty);
    return current + Math.abs(qty);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">📦 การเคลื่อนไหวสต็อก</h1>
        <button
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            showForm ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'ยกเลิก' : '+ ปรับปรุงสต็อก'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">{error}</div>}

      {/* Form */}
      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">ปรับปรุงสต็อก</h3>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">สินค้า *</label>
                <SearchableSelect
                  options={products.map((p) => ({ value: p._id, label: p.name }))}
                  value={selectedProduct?._id || ''}
                  onChange={handleProductChange}
                  placeholder="เลือกสินค้า..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">รายการ *</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
                  value={selectedVariant?._id || ''}
                  onChange={(e) => {
                    const variant = selectedProduct?.variants?.find((v) => v._id === e.target.value);
                    setSelectedVariant(variant || null);
                  }}
                  disabled={!selectedProduct}
                >
                  <option value="">เลือกรายการ...</option>
                  {(selectedProduct?.variants || []).map((v) => (
                    <option key={v._id} value={v._id}>
                      {v.sku} - สต็อก: {fmtNumber.format(v.stockOnHand || 0)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ประเภท *</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.movementType}
                  onChange={(e) => setFormData({ ...formData, movementType: e.target.value })}
                >
                  {MOVEMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  จำนวน * {formData.movementType === 'adjust' && <span className="text-gray-500">(+ เพิ่ม / - ลด)</span>}
                </label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder={formData.movementType === 'adjust' ? 'เช่น 10 หรือ -5' : 'จำนวน'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เหตุผล</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="เหตุผลในการปรับปรุง"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="หมายเหตุเพิ่มเติม"
                />
              </div>
            </div>

            {selectedVariant && (
              <p className="mt-4 text-gray-600">
                สต็อกปัจจุบัน: <strong>{fmtNumber.format(selectedVariant.stockOnHand || 0)}</strong>
                {formData.quantity && (
                  <>
                    {' → '}
                    <strong className={getNewStock() < 0 ? 'text-red-600' : 'text-green-600'}>
                      {fmtNumber.format(getNewStock())}
                    </strong>
                  </>
                )}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button
                type="button"
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg"
                onClick={() => setShowForm(false)}
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <form onSubmit={handleFilter} className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">ประเภท</label>
          <select
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
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
            className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            value={filterSku}
            onChange={(e) => setFilterSku(e.target.value)}
            placeholder="SKU..."
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">จากวันที่</label>
          <input
            type="date"
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ถึงวันที่</label>
          <input
            type="date"
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <button type="submit" className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg">
          🔍 ค้นหา
        </button>
        <button
          type="button"
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg"
          onClick={clearFilters}
        >
          ล้าง
        </button>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl shadow p-6">
        {loading ? (
          <p className="text-gray-600">กำลังโหลด...</p>
        ) : movements.length === 0 ? (
          <p className="text-center text-gray-500 py-8">ไม่พบรายการ</p>
        ) : (
          <>
            <div className="overflow-x-auto">
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
