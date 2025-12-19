import { useEffect, useState } from 'react';
import api from '../api.js';

const defaultItem = { productId: '', variantId: '', quantity: 1, type: 'sale' };

export default function Orders() {
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([defaultItem]);
  const [reference, setReference] = useState('');
  const [type, setType] = useState('sale');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
        items: items.map((it) => ({ ...it, quantity: Number(it.quantity) || 0 })),
      };
      await api.post('/inventory/orders', payload);
      setMessage('Order recorded');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record');
    }
  };

  return (
    <div className="card">
      <h2>Orders / Movements</h2>
      <form className="form-grid" style={{ gap: 16 }} onSubmit={handleSubmit}>
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
                  <select className="input" value={item.productId} onChange={(e) => updateItem(idx, { productId: e.target.value, variantId: '' })}>
                    <option value="">เลือกสินค้า</option>
                    {products.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#666', marginBottom: 4, display: 'block' }}>เวอร์ชัน</label>
                  <select className="input" value={item.variantId} onChange={(e) => updateItem(idx, { variantId: e.target.value })}>
                    <option value="">เลือกเวอร์ชัน</option>
                    {variants.map((v) => (
                      <option key={v._id} value={v._id}>
                        {v.sku || v.name || 'Variant'} (stock: {v.stockOnHand})
                      </option>
                    ))}
                  </select>
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
    </div>
  );
}
