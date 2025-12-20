import { useEffect, useState } from 'react';
import api from '../api.js';

export default function CategoriesBrands() {
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('categories');
  
  // Category form states
  const [newCategory, setNewCategory] = useState({ name: '', prefix: '', description: '' });
  const [savingCategory, setSavingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  
  // Brand form states
  const [newBrand, setNewBrand] = useState({ name: '', prefix: '', description: '' });
  const [savingBrand, setSavingBrand] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);

  // Load data
  const loadCategories = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data || []);
    } catch (err) {
      setError('Failed to load categories');
      console.error(err);
    }
  };

  const loadBrands = async () => {
    try {
      const res = await api.get('/brands');
      setBrands(res.data || []);
    } catch (err) {
      setError('Failed to load brands');
      console.error(err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadCategories(), loadBrands()]).finally(() => setLoading(false));
  }, []);

  // Category handlers
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    setSavingCategory(true);
    setError('');
    try {
      await api.post('/categories', newCategory);
      setNewCategory({ name: '', prefix: '', description: '' });
      loadCategories();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create category');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleUpdateCategory = async (id) => {
    setSavingCategory(true);
    setError('');
    try {
      await api.put(`/categories/${id}`, editingCategory);
      setEditingCategory(null);
      loadCategories();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update category');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (window.confirm('Are you sure you want to delete this category?')) {
      setError('');
      try {
        await api.delete(`/categories/${id}`);
        loadCategories();
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to delete category');
      }
    }
  };

  // Brand handlers
  const handleCreateBrand = async (e) => {
    e.preventDefault();
    setSavingBrand(true);
    setError('');
    try {
      await api.post('/brands', newBrand);
      setNewBrand({ name: '', prefix: '', description: '' });
      loadBrands();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create brand');
    } finally {
      setSavingBrand(false);
    }
  };

  const handleUpdateBrand = async (id) => {
    setSavingBrand(true);
    setError('');
    try {
      await api.put(`/brands/${id}`, editingBrand);
      setEditingBrand(null);
      loadBrands();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update brand');
    } finally {
      setSavingBrand(false);
    }
  };

  const handleDeleteBrand = async (id) => {
    if (window.confirm('Are you sure you want to delete this brand?')) {
      setError('');
      try {
        await api.delete(`/brands/${id}`);
        loadBrands();
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to delete brand');
      }
    }
  };

  return (
    <div className="card">
      <h2>จัดการหมวดหมู่และยี่ห้อ</h2>
      {error && <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div>}
      {loading && <span>Loading...</span>}

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid #e0e0e0' }}>
        <button
          onClick={() => setActiveTab('categories')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'categories' ? 'bold' : 'normal',
            borderBottom: activeTab === 'categories' ? '3px solid #0066cc' : 'none',
            color: activeTab === 'categories' ? '#0066cc' : '#666',
            marginBottom: -1,
          }}
        >
          หมวดหมู่
        </button>
        <button
          onClick={() => setActiveTab('brands')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'brands' ? 'bold' : 'normal',
            borderBottom: activeTab === 'brands' ? '3px solid #0066cc' : 'none',
            color: activeTab === 'brands' ? '#0066cc' : '#666',
            marginBottom: -1,
          }}
        >
          ยี่ห้อ
        </button>
      </div>

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div>
          <h3>เพิ่มหมวดหมู่ใหม่</h3>
          <form onSubmit={handleCreateCategory} style={{ marginBottom: 24 }}>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 120px 2fr auto', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>ชื่อหมวดหมู่ *</label>
                <input
                  className="input"
                  placeholder="เช่น Electronics, Clothing"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>Prefix</label>
                <input
                  className="input"
                  placeholder="เช่น ELEC"
                  value={newCategory.prefix}
                  onChange={(e) => setNewCategory({ ...newCategory, prefix: e.target.value.toUpperCase() })}
                  maxLength={10}
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>รายละเอียด</label>
                <input
                  className="input"
                  placeholder="รายละเอียดเพิ่มเติม"
                  value={newCategory.description}
                  onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                />
              </div>
              <div>
                <button className="button" type="submit" disabled={savingCategory} style={{ marginTop: 22 }}>
                  {savingCategory ? 'Saving...' : 'เพิ่ม'}
                </button>
              </div>
            </div>
          </form>

          <h3>รายการหมวดหมู่</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>ชื่อ</th>
                  <th>รายละเอียด</th>
                  <th>การกระทำ</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) =>
                  editingCategory?._id === cat._id ? (
                    <tr key={cat._id}>
                      <td>
                        <input
                          className="input"
                          value={editingCategory.name}
                          onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={editingCategory.prefix || ''}
                          onChange={(e) => setEditingCategory({ ...editingCategory, prefix: e.target.value.toUpperCase() })}
                          style={{ width: '100%', textTransform: 'uppercase' }}
                          maxLength={10}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={editingCategory.description}
                          onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => handleUpdateCategory(cat._id)}
                          disabled={savingCategory}
                          style={{ marginRight: 8, padding: '4px 8px' }}
                          className="button"
                        >
                          {savingCategory ? 'Saving...' : 'บันทึก'}
                        </button>
                        <button
                          onClick={() => setEditingCategory(null)}
                          style={{ padding: '4px 8px', background: '#ccc', border: 'none', cursor: 'pointer', borderRadius: 4 }}
                        >
                          ยกเลิก
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={cat._id}>
                      <td>{cat.name}</td>
                      <td>{cat.prefix || '-'}</td>
                      <td>{cat.description}</td>
                      <td>
                        <button
                          onClick={() => setEditingCategory(cat)}
                          style={{ marginRight: 8, padding: '4px 8px', cursor: 'pointer', background: '#e3f2fd', border: '1px solid #0066cc', borderRadius: 4, color: '#0066cc' }}
                        >
                          แก้ไข
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat._id)}
                          style={{ padding: '4px 8px', cursor: 'pointer', background: '#ffebee', border: '1px solid crimson', borderRadius: 4, color: 'crimson' }}
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Brands Tab */}
      {activeTab === 'brands' && (
        <div>
          <h3>เพิ่มยี่ห้อใหม่</h3>
          <form onSubmit={handleCreateBrand} style={{ marginBottom: 24 }}>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 120px 2fr auto', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>ชื่อยี่ห้อ *</label>
                <input
                  className="input"
                  placeholder="เช่น Sony, Samsung, Nike"
                  value={newBrand.name}
                  onChange={(e) => setNewBrand({ ...newBrand, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>Prefix</label>
                <input
                  className="input"
                  placeholder="เช่น SONY"
                  value={newBrand.prefix}
                  onChange={(e) => setNewBrand({ ...newBrand, prefix: e.target.value.toUpperCase() })}
                  maxLength={10}
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>รายละเอียด</label>
                <input
                  className="input"
                  placeholder="รายละเอียดเพิ่มเติม"
                  value={newBrand.description}
                  onChange={(e) => setNewBrand({ ...newBrand, description: e.target.value })}
                />
              </div>
              <div>
                <button className="button" type="submit" disabled={savingBrand} style={{ marginTop: 22 }}>
                  {savingBrand ? 'Saving...' : 'เพิ่ม'}
                </button>
              </div>
            </div>
          </form>

          <h3>รายการยี่ห้อ</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>ชื่อ</th>
                  <th>Prefix</th>
                  <th>รายละเอียด</th>
                  <th>การกระทำ</th>
                </tr>
              </thead>
              <tbody>
                {brands.map((brand) =>
                  editingBrand?._id === brand._id ? (
                    <tr key={brand._id}>
                      <td>
                        <input
                          className="input"
                          value={editingBrand.name}
                          onChange={(e) => setEditingBrand({ ...editingBrand, name: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={editingBrand.prefix || ''}
                          onChange={(e) => setEditingBrand({ ...editingBrand, prefix: e.target.value.toUpperCase() })}
                          style={{ width: '100%', textTransform: 'uppercase' }}
                          maxLength={10}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={editingBrand.description}
                          onChange={(e) => setEditingBrand({ ...editingBrand, description: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => handleUpdateBrand(brand._id)}
                          disabled={savingBrand}
                          style={{ marginRight: 8, padding: '4px 8px' }}
                          className="button"
                        >
                          {savingBrand ? 'Saving...' : 'บันทึก'}
                        </button>
                        <button
                          onClick={() => setEditingBrand(null)}
                          style={{ padding: '4px 8px', background: '#ccc', border: 'none', cursor: 'pointer', borderRadius: 4 }}
                        >
                          ยกเลิก
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={brand._id}>
                      <td>{brand.name}</td>
                      <td>{brand.prefix || '-'}</td>
                      <td>{brand.description}</td>
                      <td>
                        <button
                          onClick={() => setEditingBrand(brand)}
                          style={{ marginRight: 8, padding: '4px 8px', cursor: 'pointer', background: '#e3f2fd', border: '1px solid #0066cc', borderRadius: 4, color: '#0066cc' }}
                        >
                          แก้ไข
                        </button>
                        <button
                          onClick={() => handleDeleteBrand(brand._id)}
                          style={{ padding: '4px 8px', cursor: 'pointer', background: '#ffebee', border: '1px solid crimson', borderRadius: 4, color: 'crimson' }}
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
