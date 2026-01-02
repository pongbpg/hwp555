import React, { useEffect, useState } from 'react';
import api from '../api.js';
import SearchableSelect from '../components/SearchableSelect.jsx';

// Function to convert AD year to Buddhist year
const getThaiYear = (date) => {
  const year = new Date(date).getFullYear();
  return year + 543;
};

// Calculate default expiry date (+2 years)
const getDefaultExpiryDate = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 2);
  return d.toISOString().split('T')[0];
};

// Generate reference number like SO2569-0001, PO2569-0001, etc.
const generateReference = (type, orderDate, orders) => {
  const prefixes = {
    sale: 'SO',
    purchase: 'PO',
    adjustment: 'ADJ',
  };
  const prefix = prefixes[type] || type.toUpperCase();
  const thaiYear = getThaiYear(orderDate);
  
  // Count existing orders of the same type and year
  const sameTypeOrders = (orders || []).filter((o) => {
    if (o.type !== type) return false;
    const oYear = getThaiYear(o.orderDate || o.createdAt);
    return oYear === thaiYear;
  });
  
  const nextNumber = sameTypeOrders.length + 1;
  const paddedNumber = String(nextNumber).padStart(4, '0');
  
  return `${prefix}${thaiYear}-${paddedNumber}`;
};

const defaultItem = { productId: '', variantId: '', quantity: 1, unitPrice: 0, type: 'sale', expiryDate: '', batchRef: '' };

export default function Orders() {
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([defaultItem]);
  const [reference, setReference] = useState('');
  const [type, setType] = useState('sale');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState('');
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  const [receiveEdits, setReceiveEdits] = useState({});
  const [receiving, setReceiving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const loadProducts = async () => {
    try {
      const res = await api.get('/products');
      setProducts(res.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load products');
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    loadOrders(page);
  }, [page, filterType, filterStatus]);

  const loadOrders = async (nextPage = page) => {
    setOrdersLoading(true);
    setOrdersError('');
    try {
      let url = `/inventory/orders?page=${nextPage}&limit=${pageSize}`;
      if (filterType) url += `&type=${filterType}`;
      if (filterStatus) url += `&status=${filterStatus}`;
      const res = await api.get(url);
      const { items: list, total, totalPages: tp } = res.data || {};
      setOrders(list || []);
      setTotalCount(total || 0);
      setTotalPages(tp || 1);
    } catch (err) {
      setOrdersError(err.response?.data?.error || 'Failed to load orders');
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    const autoRef = generateReference(type, orderDate, orders);
    setReference(autoRef);
  }, [type, orderDate, orders]);

  const handleFilterChange = (newType, newStatus) => {
    setFilterType(newType);
    setFilterStatus(newStatus);
    setPage(1);
  };

  const toggleExpand = (id) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    const order = orders.find((o) => o._id === id);
    if (order?.type === 'purchase' && order.items) {
      setReceiveEdits((prev) => ({
        ...prev,
        [id]: order.items.map((it) => it.receivedQuantity ?? 0),
      }));
    }
  };

  const calcOrderTotal = (o) => {
    const byItems = (o.items || []).reduce(
      (sum, it) => sum + (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0),
      0
    );
    // ใช้ grandTotal ถ้ามีค่า > 0, ไม่งั้นใช้ byItems
    const grandTotal = o.totals?.grandTotal || 0;
    return grandTotal > 0 ? grandTotal : byItems;
  };

  const handleReceiveChange = (orderId, idx, val) => {
    setReceiveEdits((prev) => {
      const list = prev[orderId] ? [...prev[orderId]] : [];
      list[idx] = val;
      return { ...prev, [orderId]: list };
    });
  };

  const submitReceive = async (order) => {
    if (!order?._id || order.type !== 'purchase') return;
    setReceiving(true);
    setError('');
    setMessage('');
    try {
      const edits = receiveEdits[order._id] || [];
      const payloadItems = (order.items || []).map((it, idx) => ({
        variantId: it.variantId,
        receivedQuantity: Number(edits[idx] ?? it.receivedQuantity ?? 0) || 0,
      }));
      await api.patch(`/inventory/orders/${order._id}/receive`, { items: payloadItems });
      setMessage('บันทึกรับของแล้ว');
      loadOrders(page);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to receive');
    } finally {
      setReceiving(false);
    }
  };

  const cancelOrder = async (order) => {
    if (!order?._id) return;
    if (!window.confirm(`ยืนยันยกเลิก Order ${order.reference || order._id}?\nStock จะถูก rollback กลับ`)) return;
    setError('');
    setMessage('');
    try {
      const reason = window.prompt('เหตุผลในการยกเลิก (ไม่บังคับ):', '') || '';
      await api.patch(`/inventory/orders/${order._id}/cancel`, { reason });
      setMessage('ยกเลิก Order แล้ว');
      loadOrders(page);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel order');
    }
  };

  const editOrder = async (order) => {
    if (!order?._id) return;
    const newReference = window.prompt('แก้ไขเลขอ้างอิง:', order.reference || '');
    if (newReference === null) return;
    const newNotes = window.prompt('แก้ไขหมายเหตุ:', order.notes || '');
    if (newNotes === null) return;
    setError('');
    setMessage('');
    try {
      await api.patch(`/inventory/orders/${order._id}`, { reference: newReference, notes: newNotes });
      setMessage('แก้ไข Order แล้ว');
      loadOrders(page);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to edit order');
    }
  };

  const updateItem = (idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const addItem = () => setItems((prev) => [...prev, { ...defaultItem }]);
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return; // ป้องกันกดซ้ำ
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        type,
        reference,
        orderDate,
        items: items.map((it) => ({
          productId: it.productId,
          variantId: it.variantId,
          quantity: Number(it.quantity) || 0,
          unitPrice: Number(it.unitPrice) || 0,
          batchRef: it.batchRef || undefined,
          expiryDate: it.expiryDate ? it.expiryDate : undefined,
        })),
      };
      await api.post('/inventory/orders', payload);
      setMessage('Order recorded');
      // Reset form
      setItems([{ ...defaultItem }]);
      setReference('');
      setType('sale');
      setOrderDate(new Date().toISOString().split('T')[0]);
      setPage(1);
      loadOrders(1);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    const classes = {
      completed: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700',
      pending: 'bg-yellow-100 text-yellow-700',
    };
    return classes[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">📋 คำสั่งซื้อ / ขาย</h1>
      </div>

      {message && <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-lg">{message}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">{error}</div>}

      {/* Create Order Form */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">สร้าง Order ใหม่</h2>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ประเภท</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="sale">Sale (ขาย)</option>
                <option value="purchase">Purchase (ซื้อ)</option>
                <option value="adjustment">Adjustment (ปรับปรุง)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เลขอ้างอิง (อัตโนมัติ)</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 font-mono font-semibold focus:ring-2 focus:ring-blue-500 outline-none cursor-not-allowed"
                value={reference}
                readOnly
                placeholder="Auto-generated"
              />
              <p className="text-xs text-gray-500 mt-1">✓ สร้างจากประเภท วันที่ และเลขลำดับ</p>
            </div>
          </div>

          {/* Items */}
          <div className="space-y-3 mb-4">
            {items.map((item, idx) => {
              const product = products.find((p) => p._id === item.productId);
              const variants = product?.variants || [];
              const selectedVariantIds = items
                .filter((it, i) => i !== idx && it.productId === item.productId && it.variantId)
                .map((it) => it.variantId);
              const availableVariants = variants.filter((v) => !selectedVariantIds.includes(v._id));

              return (
                <div key={idx} className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
                  <div className="text-xs text-gray-500 mb-2">รายการที่ {idx + 1}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">สินค้า</label>
                      <SearchableSelect
                        options={products}
                        value={item.productId}
                        onChange={(val) => updateItem(idx, { productId: val, variantId: '' })}
                        placeholder="ค้นหาสินค้า..."
                        getLabel={(p) => p.name}
                        getId={(p) => p._id}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">เวอร์ชัน</label>
                      <SearchableSelect
                        options={availableVariants.map((v) => ({
                          ...v,
                          displayName: `${v.sku || v.name || 'Variant'} (stock: ${v.stockOnHand})`,
                        }))}
                        value={item.variantId}
                        onChange={(val) => updateItem(idx, { variantId: val })}
                        placeholder="ค้นหา SKU..."
                        getLabel={(v) => v.displayName}
                        getId={(v) => v._id}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">จำนวน</label>
                      <input
                        type="number"
                        min="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">💰 ราคา/หน่วย</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(idx, { unitPrice: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  {/* Purchase Order: เพิ่มช่อง Batch และ วันหมดอายุ */}
                  {type === 'purchase' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">เลขล็อต (Batch Ref)</label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          value={item.batchRef || ''}
                          onChange={(e) => updateItem(idx, { batchRef: e.target.value })}
                          placeholder="เช่น LOT-2025-001"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">📅 วันหมดอายุ (ไม่บังคับ)</label>
                        <input
                          type="date"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          value={item.expiryDate || ''}
                          onChange={(e) => updateItem(idx, { expiryDate: e.target.value })}
                        />
                        <p className="text-xs text-gray-400 mt-1">สำหรับสินค้าที่มีอายุการใช้ (เช่น ยา อาหาร)</p>
                      </div>
                    </div>
                  )}
                  {items.length > 1 && (
                    <button
                      type="button"
                      className="mt-3 text-red-600 hover:text-red-700 text-sm"
                      onClick={() => removeItem(idx)}
                    >
                      🗑 ลบแถว
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg"
              onClick={addItem}
              disabled={submitting}
            >
              + เพิ่มแถว
            </button>
            <button 
              type="submit" 
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={submitting}
            >
              {submitting ? 'กำลังบันทึก...' : 'ส่ง'}
            </button>
          </div>
        </form>
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Order Records</h2>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">ประเภท</label>
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={filterType}
              onChange={(e) => handleFilterChange(e.target.value, filterStatus)}
            >
              <option value="">ทั้งหมด</option>
              <option value="sale">Sale (ขาย)</option>
              <option value="purchase">Purchase (ซื้อ)</option>
              <option value="adjustment">Adjustment (ปรับปรุง)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">สถานะ</label>
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={filterStatus}
              onChange={(e) => handleFilterChange(filterType, e.target.value)}
            >
              <option value="">ทั้งหมด</option>
              <option value="pending">Pending (รอดำเนินการ)</option>
              <option value="completed">Completed (เสร็จสิ้น)</option>
              <option value="cancelled">Cancelled (ยกเลิก)</option>
            </select>
          </div>
        </div>

        {ordersLoading && <p className="text-gray-600">Loading orders...</p>}
        {ordersError && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4">{ordersError}</div>}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">วันที่</th>
                <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">ประเภท</th>
                <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">Reference</th>
                <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">สถานะ</th>
                <th className="text-center py-2 px-3 text-sm font-semibold text-gray-600">รายการ</th>
                <th className="text-center py-2 px-3 text-sm font-semibold text-gray-600">จำนวนสินค้า</th>
                <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">มูลค่ารวม</th>
                <th className="text-center py-2 px-3 text-sm font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <React.Fragment key={o._id}>
                  <tr
                    key={o._id}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${o.status === 'cancelled' ? 'opacity-50 line-through' : ''}`}
                  >
                    <td className="py-2 px-3 text-sm">
                      {o.orderDate
                        ? new Date(o.orderDate).toLocaleDateString('th-TH')
                        : o.createdAt
                        ? new Date(o.createdAt).toLocaleDateString('th-TH')
                        : '-'}
                    </td>
                    <td className="py-2 px-3 text-sm capitalize">{o.type}</td>
                    <td className="py-2 px-3 text-sm">{o.reference || '-'}</td>
                    <td className="py-2 px-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(o.status)}`}>
                        {o.status || '-'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sm text-center">{o.items?.length ?? 0}</td>
                    <td className="py-2 px-3 text-sm text-center">{(o.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)}</td>
                    <td className="py-2 px-3 text-sm text-right">{calcOrderTotal(o).toLocaleString()}</td>
                    <td className="py-2 px-3 text-sm">
                      <div className="flex gap-1 justify-center flex-wrap">
                        <button
                          type="button"
                          className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                          onClick={() => toggleExpand(o._id)}
                        >
                          {expandedOrders.has(o._id) ? 'ซ่อน' : 'ดู'}
                        </button>
                        {o.status !== 'cancelled' && (
                          <>
                            <button
                              type="button"
                              className="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
                              onClick={() => editOrder(o)}
                            >
                              ✏️ แก้ไข
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded"
                              onClick={() => cancelOrder(o)}
                            >
                              ❌ ยกเลิก
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedOrders.has(o._id) && (
                    <tr>
                      <td colSpan={9}>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 m-2">
                          <div className="flex gap-6 mb-3 text-sm text-gray-600">
                            <div>
                              <strong>Reference:</strong> {o.reference || '-'}
                            </div>
                            <div>
                              <strong>Channel:</strong> {o.channel || '-'}
                            </div>
                            <div>
                              <strong>Notes:</strong> {o.notes || '-'}
                            </div>
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-300">
                                <th className="text-left py-2 px-2">สินค้า</th>
                                <th className="text-left py-2 px-2">SKU</th>
                                <th className="text-left py-2 px-2">ล็อต</th>
                                <th className="text-left py-2 px-2">หมดอายุ</th>
                                <th className="text-right py-2 px-2 w-20">จำนวน</th>
                                <th className="text-right py-2 px-2 w-24">รับแล้ว</th>
                                <th className="text-right py-2 px-2 w-20">ค้างรับ</th>
                                <th className="text-right py-2 px-2 w-24">ราคา/หน่วย</th>
                                <th className="text-right py-2 px-2 w-28">ราคารวม</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(o.items || []).map((it, idx) => (
                                <tr key={idx} className="border-b border-gray-100">
                                  <td className="py-2 px-2">{it.productName || '-'}</td>
                                  <td className="py-2 px-2 font-mono text-gray-600">{it.sku || '-'}</td>
                                  <td className="py-2 px-2 text-gray-600">{it.batchRef || '-'}</td>
                                  <td className="py-2 px-2 text-gray-600">
                                    {it.expiryDate ? new Date(it.expiryDate).toLocaleDateString('th-TH') : '-'}
                                  </td>
                                  <td className="py-2 px-2 text-right">{it.quantity ?? 0}</td>
                                  <td className="py-2 px-2 text-right">
                                    {o.type === 'purchase' ? (
                                      <input
                                        type="number"
                                        min="0"
                                        max={it.quantity ?? 0}
                                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-right"
                                        value={receiveEdits[o._id]?.[idx] ?? it.receivedQuantity ?? 0}
                                        onChange={(e) => handleReceiveChange(o._id, idx, e.target.value)}
                                      />
                                    ) : (
                                      it.quantity ?? 0
                                    )}
                                  </td>
                                  <td className="py-2 px-2 text-right">
                                    {Math.max(0, (it.quantity ?? 0) - (receiveEdits[o._id]?.[idx] ?? it.receivedQuantity ?? 0))}
                                  </td>
                                  <td className="py-2 px-2 text-right">{it.unitPrice ?? 0}</td>
                                  <td className="py-2 px-2 text-right">
                                    {((Number(it.unitPrice) || 0) * (Number(it.quantity) || 0)).toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {o.type === 'purchase' && (
                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                                onClick={() => submitReceive(o)}
                                disabled={receiving}
                              >
                                {receiving ? 'กำลังบันทึก...' : 'บันทึกรับของ'}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {orders.length === 0 && !ordersLoading && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">
                    No orders
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > pageSize && (
          <div className="flex gap-2 items-center mt-4">
            <button
              type="button"
              className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: totalPages }).map((_, i) => {
                const num = i + 1;
                const isActive = num === page;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setPage(num)}
                    className={`px-3 py-1 rounded text-sm ${
                      isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'
                    }`}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
