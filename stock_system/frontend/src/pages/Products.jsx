import { useEffect, useState } from 'react';
import api from '../api.js';

const emptyProduct = {
  name: '',
  sku: '',
  category: '',
  brand: '',
  price: 0,
  stockOnHand: 0,
  reorderPoint: 0,
  reorderQty: 0,
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newProduct, setNewProduct] = useState(emptyProduct);
  const [saving, setSaving] = useState(false);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/products');
      setProducts(res.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: newProduct.name,
        sku: newProduct.sku,
        category: newProduct.category,
        brand: newProduct.brand,
        variants: [
          {
            sku: newProduct.sku || `SKU-${Date.now()}`,
            price: Number(newProduct.price) || 0,
            stockOnHand: Number(newProduct.stockOnHand) || 0,
            reorderPoint: Number(newProduct.reorderPoint) || 0,
            reorderQty: Number(newProduct.reorderQty) || 0,
            attributes: {},
          },
        ],
      };
      await api.post('/products', payload);
      setNewProduct(emptyProduct);
      loadProducts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Products</h2>
        {loading && <span>Loading...</span>}
      </div>
      {error && <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div>}

      <form onSubmit={handleCreate} className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>ชื่อสินค้า *</label>
          <input className="input" placeholder="Name" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} required />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>SKU</label>
          <input className="input" placeholder="SKU" value={newProduct.sku} onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>หมวดหมู่</label>
          <input className="input" placeholder="Category" value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>ยี่ห้อ</label>
          <input className="input" placeholder="Brand" value={newProduct.brand} onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>ราคา</label>
          <input className="input" type="number" placeholder="Price" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>คงคลัง</label>
          <input className="input" type="number" placeholder="Stock" value={newProduct.stockOnHand} onChange={(e) => setNewProduct({ ...newProduct, stockOnHand: e.target.value })} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>จุดสั่งซื้อ</label>
          <input className="input" type="number" placeholder="Reorder Point" value={newProduct.reorderPoint} onChange={(e) => setNewProduct({ ...newProduct, reorderPoint: e.target.value })} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>จำนวนสั่งซื้อ</label>
          <input className="input" type="number" placeholder="Reorder Qty" value={newProduct.reorderQty} onChange={(e) => setNewProduct({ ...newProduct, reorderQty: e.target.value })} />
        </div>
        <button className="button" type="submit" disabled={saving} style={{ gridColumn: '1 / -1' }}>
          {saving ? 'Saving...' : 'Add Product'}
        </button>
      </form>

      <div style={{ marginTop: 24, overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Reorder</th>
              <th>Variants</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const v0 = p.variants?.[0];
              return (
                <tr key={p._id}>
                  <td>{p.name}</td>
                  <td>{p.sku || v0?.sku}</td>
                  <td>{p.category}</td>
                  <td>{v0?.stockOnHand ?? '-'}</td>
                  <td>
                    {v0?.reorderPoint ?? 0} / {v0?.reorderQty ?? 0}
                  </td>
                  <td>{p.variants?.length || 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
