import { useEffect, useState } from 'react';
import api from '../api.js';
import SearchableSelect from '../components/SearchableSelect.jsx';

const defaultItem = { productId: '', variantId: '', quantity: 1, type: 'sale' };

export default function Orders() {
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([defaultItem]);
  const [reference, setReference] = useState('');
  const [type, setType] = useState('sale');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // Orders listing state
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
  // Filters for orders listing
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
    loadOrders(page);
  }, [page]);

  useEffect(() => {
    setPage(1);
  }, [filterType, filterStatus]);

  const handleFilterChange = (newType, newStatus) => {
    setFilterType(newType);
    setFilterStatus(newStatus);
  };

  const toggleExpand = (id) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // prime receive edits
    const order = orders.find((o) => o._id === id);
    if (order?.type === 'purchase' && order.items) {
      setReceiveEdits((prev) => ({
        ...prev,
        [id]: order.items.map((it) => it.receivedQuantity ?? 0),
      }));
    }
  };

  const calcOrderTotal = (o) => {
    const byItems = (o.items || []).reduce((sum, it) => sum + ((Number(it.unitPrice) || 0) * (Number(it.quantity) || 0)), 0);
    const grand = o.totals?.grandTotal;
    return grand ?? byItems;
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

  const updateItem = (idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const addItem = () => setItems((prev) => [...prev, defaultItem]);

  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const payload = {
        type,
        reference,
        orderDate,
        items: items.map((it) => ({ ...it, quantity: Number(it.quantity) || 0 })),
      };
      await api.post('/inventory/orders', payload);
      setMessage('Order recorded');
      // Refresh orders list to include newly recorded order
      setPage(1);
      loadOrders(1);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record');
    }
  };

  return (
    <div className="card">
      <h2>Orders / Movements</h2>
      <form className="form-grid" style={{ gap: 16 }} onSubmit={handleSubmit}>

        <div>
          <label>วันที่</label>
          <input className="input" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </div>
        <div>
          <label>ประเภท</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="sale">Sale (ขาย)</option>
            <option value="purchase">Purchase (ซื้อ)</option>
            <option value="adjustment">Adjustment (ปรับปรุง)</option>
          </select>
        </div>
        <div>
          <label>เลขอ้างอิง</label>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="SO-001 or PO-001" />
        </div>

        {items.map((item, idx) => {
          const product = products.find((p) => p._id === item.productId);
          const variants = product?.variants || [];
          return (
            <div key={idx} className="card" style={{ border: '1px dashed #e5e7eb', padding: 12 }}>
              <div style={{ marginBottom: 8, fontSize: '0.875rem', color: '#666' }}>แถวที่ {idx + 1}</div>
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#666', marginBottom: 4, display: 'block' }}>สินค้า</label>
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
                  <label style={{ fontSize: '0.75rem', color: '#666', marginBottom: 4, display: 'block' }}>เวอร์ชัน</label>
                  <SearchableSelect
                    options={variants.map((v) => ({
                      ...v,
                      displayName: `${v.sku || v.name || 'Variant'} (stock: ${v.stockOnHand})`
                    }))}
                    value={item.variantId}
                    onChange={(val) => updateItem(idx, { variantId: val })}
                    placeholder="ค้นหา SKU..."
                    getLabel={(v) => v.displayName}
                    getId={(v) => v._id}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#666', marginBottom: 4, display: 'block' }}>จำนวน</label>
                  <input className="input" type="number" min="0" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} />
                </div>
              </div>
              {items.length > 1 && (
                <button type="button" className="button secondary" onClick={() => removeItem(idx)} style={{ fontSize: '0.875rem', padding: '4px 8px' }}>
                  🗑 ลบแถว
                </button>
              )}
            </div>
          );
        })}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="button secondary" onClick={addItem}>
            + เพิ่มแถว
          </button>
          <button className="button" type="submit">
            ส่ง
          </button>
        </div>
        {message && <div style={{ color: 'green' }}>{message}</div>}
        {error && <div style={{ color: 'crimson' }}>{error}</div>}
      </form>
  
      <div style={{ marginTop: 24 }}>
        <h2>Order Records</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '0.875rem', display: 'block', marginBottom: 4 }}>ประเภท</label>
            <select 
              className="input" 
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
            <label style={{ fontSize: '0.875rem', display: 'block', marginBottom: 4 }}>สถานะ</label>
            <select 
              className="input" 
              value={filterStatus}
              onChange={(e) => handleFilterChange(filterType, e.target.value)}
            >
              <option value="">ทั้งหมด</option>
              <option value="pending">Pending (รอดำเนิน)</option>
              <option value="completed">Completed (เสร็จสิ้น)</option>
              <option value="cancelled">Cancelled (ยกเลิก)</option>
            </select>
          </div>
        </div>
        {ordersLoading && <div>Loading orders...</div>}
        {ordersError && <div style={{ color: 'crimson' }}>{ordersError}</div>}
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Reference</th>
                <th>Status</th>
                <th>Items</th>
                <th>Total</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <>
                  <tr key={o._id}>
                    <td>{o.createdAt ? new Date(o.createdAt).toLocaleString() : '-'}</td>
                    <td>{o.type}</td>
                    <td>{o.reference || '-'}</td>
                    <td>{o.status || '-'}</td>
                    <td>{o.items?.length ?? 0}</td>
                    <td>{calcOrderTotal(o)}</td>
                    <td>
                      <button type="button" className="button secondary" onClick={() => toggleExpand(o._id)}>
                        {expandedOrders.has(o._id) ? 'ซ่อน' : 'รายละเอียด'}
                      </button>
                    </td>
                  </tr>
                  {expandedOrders.has(o._id) && (
                    <tr>
                      <td colSpan={7}>
                        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: 12 }}>
                          <div style={{ display: 'flex', gap: 16, marginBottom: 8, color: '#555', fontSize: '0.875rem' }}>
                            <div><strong>Reference:</strong> {o.reference || '-'}</div>
                            <div><strong>Channel:</strong> {o.channel || '-'}</div>
                            <div><strong>Notes:</strong> {o.notes || '-'}</div>
                          </div>
                          <table className="table" style={{ marginTop: 8 }}>
                            <thead>
                              <tr>
                                <th>สินค้า</th>
                                <th>SKU</th>
                                <th style={{ width: 100 }}>จำนวน</th>
                                <th style={{ width: 100 }}>รับแล้ว</th>
                                <th style={{ width: 100 }}>ค้างรับ</th>
                                <th style={{ width: 120 }}>ราคา/หน่วย</th>
                                <th style={{ width: 140 }}>ราคารวม</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(o.items || []).map((it, idx) => (
                                <tr key={idx}>
                                  <td>{it.productName || '-'}</td>
                                  <td>{it.sku || '-'}</td>
                                  <td>{it.quantity ?? 0}</td>
                                  <td>
                                    {o.type === 'purchase' ? (
                                      <input
                                        type="number"
                                        min="0"
                                        max={it.quantity ?? 0}
                                        className="input"
                                        style={{ width: '100px' }}
                                        value={
                                          receiveEdits[o._id]?.[idx] !== undefined
                                            ? receiveEdits[o._id][idx]
                                            : (it.receivedQuantity ?? 0)
                                        }
                                        onChange={(e) => handleReceiveChange(o._id, idx, e.target.value)}
                                      />
                                    ) : (
                                      it.quantity ?? 0
                                    )}
                                  </td>
                                  <td>{Math.max(0, (it.quantity ?? 0) - (receiveEdits[o._id]?.[idx] ?? it.receivedQuantity ?? 0))}</td>
                                  <td>{it.unitPrice ?? 0}</td>
                                  <td>{((Number(it.unitPrice) || 0) * (Number(it.quantity) || 0)).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {o.type === 'purchase' && (
                            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="button"
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
                </>
              ))}
              {orders.length === 0 && !ordersLoading && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#666' }}>No orders</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalCount > pageSize && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button
              type="button"
              className="button secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {Array.from({ length: totalPages }).map((_, i) => {
                const num = i + 1;
                const isActive = num === page;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setPage(num)}
                    className="button secondary"
                    style={{
                      padding: '4px 8px',
                      background: isActive ? '#0066cc' : undefined,
                      color: isActive ? '#fff' : undefined,
                    }}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="button secondary"
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
