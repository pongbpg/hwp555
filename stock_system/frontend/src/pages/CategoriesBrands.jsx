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

  const loadCategories = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data || []);
    } catch (err) {
      setError('Failed to load categories');
    }
  };

  const loadBrands = async () => {
    try {
      const res = await api.get('/brands');
      setBrands(res.data || []);
    } catch (err) {
      setError('Failed to load brands');
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">🏷️ จัดการหมวดหมู่และยี่ห้อ</h1>
        {loading && <span className="text-gray-500">Loading...</span>}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">{error}</div>}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-4 py-2 -mb-px font-medium transition-colors ${
              activeTab === 'categories'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📁 หมวดหมู่
          </button>
          <button
            onClick={() => setActiveTab('brands')}
            className={`px-4 py-2 -mb-px font-medium transition-colors ${
              activeTab === 'brands'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            🏢 ยี่ห้อ
          </button>
        </div>
      </div>

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="space-y-6">
          {/* Add Category Form */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">เพิ่มหมวดหมู่ใหม่</h3>
            <form onSubmit={handleCreateCategory}>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อหมวดหมู่ *</label>
                  <input
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="เช่น Electronics, Clothing"
                    value={newCategory.name}
                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prefix</label>
                  <input
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                    placeholder="เช่น ELEC"
                    value={newCategory.prefix}
                    onChange={(e) => setNewCategory({ ...newCategory, prefix: e.target.value.toUpperCase() })}
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">รายละเอียด</label>
                  <input
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="รายละเอียดเพิ่มเติม"
                    value={newCategory.description}
                    onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                    disabled={savingCategory}
                  >
                    {savingCategory ? 'Saving...' : 'เพิ่ม'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Categories List */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">รายการหมวดหมู่</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">ชื่อ</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">Prefix</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">รายละเอียด</th>
                    <th className="text-center py-2 px-3 text-sm font-semibold text-gray-600">การกระทำ</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat) =>
                    editingCategory?._id === cat._id ? (
                      <tr key={cat._id} className="border-b border-gray-100 bg-blue-50">
                        <td className="py-2 px-3">
                          <input
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            value={editingCategory.name}
                            onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                            value={editingCategory.prefix || ''}
                            onChange={(e) => setEditingCategory({ ...editingCategory, prefix: e.target.value.toUpperCase() })}
                            maxLength={10}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            value={editingCategory.description || ''}
                            onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => handleUpdateCategory(cat._id)}
                              disabled={savingCategory}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded disabled:opacity-50"
                            >
                              {savingCategory ? 'Saving...' : 'บันทึก'}
                            </button>
                            <button
                              onClick={() => setEditingCategory(null)}
                              className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={cat._id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 text-sm">{cat.name}</td>
                        <td className="py-2 px-3 text-sm font-mono text-gray-600">{cat.prefix || '-'}</td>
                        <td className="py-2 px-3 text-sm text-gray-600">{cat.description || '-'}</td>
                        <td className="py-2 px-3">
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => setEditingCategory(cat)}
                              className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm rounded"
                            >
                              แก้ไข
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(cat._id)}
                              className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-sm rounded"
                            >
                              ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                  {categories.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-500">
                        ไม่มีหมวดหมู่
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Brands Tab */}
      {activeTab === 'brands' && (
        <div className="space-y-6">
          {/* Add Brand Form */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">เพิ่มยี่ห้อใหม่</h3>
            <form onSubmit={handleCreateBrand}>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อยี่ห้อ *</label>
                  <input
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="เช่น Sony, Samsung, Nike"
                    value={newBrand.name}
                    onChange={(e) => setNewBrand({ ...newBrand, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prefix</label>
                  <input
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                    placeholder="เช่น SONY"
                    value={newBrand.prefix}
                    onChange={(e) => setNewBrand({ ...newBrand, prefix: e.target.value.toUpperCase() })}
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">รายละเอียด</label>
                  <input
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="รายละเอียดเพิ่มเติม"
                    value={newBrand.description}
                    onChange={(e) => setNewBrand({ ...newBrand, description: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                    disabled={savingBrand}
                  >
                    {savingBrand ? 'Saving...' : 'เพิ่ม'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Brands List */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">รายการยี่ห้อ</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">ชื่อ</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">Prefix</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">รายละเอียด</th>
                    <th className="text-center py-2 px-3 text-sm font-semibold text-gray-600">การกระทำ</th>
                  </tr>
                </thead>
                <tbody>
                  {brands.map((brand) =>
                    editingBrand?._id === brand._id ? (
                      <tr key={brand._id} className="border-b border-gray-100 bg-blue-50">
                        <td className="py-2 px-3">
                          <input
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            value={editingBrand.name}
                            onChange={(e) => setEditingBrand({ ...editingBrand, name: e.target.value })}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                            value={editingBrand.prefix || ''}
                            onChange={(e) => setEditingBrand({ ...editingBrand, prefix: e.target.value.toUpperCase() })}
                            maxLength={10}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            value={editingBrand.description || ''}
                            onChange={(e) => setEditingBrand({ ...editingBrand, description: e.target.value })}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => handleUpdateBrand(brand._id)}
                              disabled={savingBrand}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded disabled:opacity-50"
                            >
                              {savingBrand ? 'Saving...' : 'บันทึก'}
                            </button>
                            <button
                              onClick={() => setEditingBrand(null)}
                              className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={brand._id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 text-sm">{brand.name}</td>
                        <td className="py-2 px-3 text-sm font-mono text-gray-600">{brand.prefix || '-'}</td>
                        <td className="py-2 px-3 text-sm text-gray-600">{brand.description || '-'}</td>
                        <td className="py-2 px-3">
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => setEditingBrand(brand)}
                              className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm rounded"
                            >
                              แก้ไข
                            </button>
                            <button
                              onClick={() => handleDeleteBrand(brand._id)}
                              className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-sm rounded"
                            >
                              ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                  {brands.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-500">
                        ไม่มียี่ห้อ
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
