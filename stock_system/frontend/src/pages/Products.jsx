import { useEffect, useState } from 'react';
import api from '../api.js';

const emptyProduct = {
  name: '',
  sku: '',
  category: '',
  brand: '',
  price: 0,
  stockOnHand: 0,
  leadTimeDays: 0,
};

const emptyVariant = {
  sku: '',
  color: '',
  size: '',
  material: '',
  price: 0,
  stockOnHand: 0,
  leadTimeDays: 0,
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newProduct, setNewProduct] = useState(emptyProduct);
  const [variants, setVariants] = useState([{ ...emptyVariant }]);
  const [saving, setSaving] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
  const [showNewBrandForm, setShowNewBrandForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryPrefix, setNewCategoryPrefix] = useState('');
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandPrefix, setNewBrandPrefix] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);

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

  const loadCategories = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data || []);
    } catch (err) {
      console.error('Failed to load categories');
    }
  };

  const loadBrands = async () => {
    try {
      const res = await api.get('/brands');
      setBrands(res.data || []);
    } catch (err) {
      console.error('Failed to load brands');
    }
  };

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadBrands();
  }, []);

  // Helper function to get next running number for SKU
  const getNextRunningNumber = (prefix) => {
    if (!prefix) return '0001';
    
    // Filter products/variants with matching prefix
    const matchingSKUs = [];
    products.forEach((product) => {
      product.variants?.forEach((variant) => {
        if (variant.sku?.startsWith(prefix)) {
          matchingSKUs.push(variant.sku);
        }
      });
    });

    if (matchingSKUs.length === 0) return '0001';

    // Extract running numbers
    const runningNumbers = matchingSKUs
      .map((sku) => {
        // Get the last part after the last hyphen
        const parts = sku.split('-');
        const lastPart = parts[parts.length - 1];
        // Check if it's a number
        const num = parseInt(lastPart, 10);
        return isNaN(num) ? 0 : num;
      })
      .filter((num) => num > 0);

    if (runningNumbers.length === 0) return '0001';

    const maxNumber = Math.max(...runningNumbers);
    const nextNumber = maxNumber + 1;
    return nextNumber.toString().padStart(4, '0');
  };

  // Auto-generate SKU for non-variant products when category or brand changes
  // Auto-generate SKU for non-variant products when category or brand changes (only when creating new)
  useEffect(() => {
    if (!editMode && !showVariants && newProduct.category && newProduct.brand && categories.length > 0 && brands.length > 0) {
      const categoryPrefix = categories.find((cat) => cat._id === newProduct.category)?.prefix || '';
      const brandPrefix = brands.find((brand) => brand._id === newProduct.brand)?.prefix || '';
      if (categoryPrefix || brandPrefix) {
        const basePrefix = [categoryPrefix, brandPrefix].filter(Boolean).join('-');
        const runningNumber = getNextRunningNumber(basePrefix);
        const generatedSKU = `${basePrefix}-${runningNumber}`;
        if (newProduct.sku !== generatedSKU) {
          setNewProduct((prev) => ({ ...prev, sku: generatedSKU }));
        }
      }
    }
  }, [newProduct.category, newProduct.brand, showVariants, categories, brands, products, editMode]);

  // Auto-generate SKU for variants when attributes change (only when creating new)
  useEffect(() => {
    if (!editMode && showVariants && (newProduct.category || newProduct.brand)) {
      const categoryPrefix = categories.find((cat) => cat._id === newProduct.category)?.prefix || '';
      const brandPrefix = brands.find((brand) => brand._id === newProduct.brand)?.prefix || '';
      const basePrefix = [categoryPrefix, brandPrefix].filter(Boolean).join('-');

      const updatedVariants = variants.map((variant) => {
        const variantSuffix = [variant.color, variant.size, variant.material]
          .filter(Boolean)
          .join('-')
          .substring(0, 10)
          .toUpperCase();
        
        const fullPrefix = variantSuffix ? `${basePrefix}-${variantSuffix}` : basePrefix;
        const runningNumber = getNextRunningNumber(fullPrefix);
        
        if (fullPrefix) {
          return { ...variant, sku: `${fullPrefix}-${runningNumber}` };
        }
        return variant;
      });

      setVariants(updatedVariants);
    }
  }, [newProduct.category, newProduct.brand, showVariants, products, editMode]);

  const handleEdit = (product) => {
    setEditMode(true);
    setEditingProductId(product._id);
    setNewProduct({
      name: product.name,
      sku: product.sku || '',
      category: product.category || '',
      brand: product.brand || '',
      price: product.variants?.[0]?.price || 0,
      stockOnHand: product.variants?.[0]?.stockOnHand || 0,
      leadTimeDays: product.variants?.[0]?.leadTimeDays || 0,
    });

    // Check if product has multiple variants or variant with attributes
    const hasVariants = product.variants?.length > 1 || 
      (product.variants?.length === 1 && 
       (product.variants[0].attributes?.color || 
        product.variants[0].attributes?.size || 
        product.variants[0].attributes?.material));

    setShowVariants(hasVariants);

    if (hasVariants) {
      const loadedVariants = product.variants.map(v => ({
        sku: v.sku,
        color: v.attributes?.color || '',
        size: v.attributes?.size || '',
        material: v.attributes?.material || '',
        price: v.price || 0,
        stockOnHand: v.stockOnHand || 0,
        leadTimeDays: v.leadTimeDays || 0,
      }));
      setVariants(loadedVariants);
    } else {
      setVariants([{ ...emptyVariant }]);
    }

    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditingProductId(null);
    setNewProduct(emptyProduct);
    setVariants([{ ...emptyVariant }]);
    setShowVariants(false);
    setShowNewCategoryForm(false);
    setShowNewBrandForm(false);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const categoryPrefix = categories.find((cat) => cat._id === newProduct.category)?.prefix || '';
      const brandPrefix = brands.find((brand) => brand._id === newProduct.brand)?.prefix || '';
      const basePrefix = [categoryPrefix, brandPrefix].filter(Boolean).join('-');
      
      const variantsPayload = showVariants
        ? variants.map((v) => {
            const variantSuffix = [v.color, v.size, v.material].filter(Boolean).join('-').substring(0, 10).toUpperCase();
            const fullPrefix = variantSuffix ? `${basePrefix}-${variantSuffix}` : basePrefix;
            const runningNumber = getNextRunningNumber(fullPrefix);
            const autoSku = `${fullPrefix}-${runningNumber}`;
            return {
              name: [v.color, v.size, v.material].filter(Boolean).join(' / ') || 'Default',
              sku: v.sku || autoSku,
              attributes: {
                ...(v.color && { color: v.color }),
                ...(v.size && { size: v.size }),
                ...(v.material && { material: v.material }),
              },
              price: Number(v.price) || 0,
              stockOnHand: Number(v.stockOnHand) || 0,
              leadTimeDays: Number(v.leadTimeDays) || 0,
            };
          })
        : [
            {
              sku: newProduct.sku || `${basePrefix}-${getNextRunningNumber(basePrefix)}`,
              price: Number(newProduct.price) || 0,
              stockOnHand: Number(newProduct.stockOnHand) || 0,
              leadTimeDays: Number(newProduct.leadTimeDays) || 0,
              attributes: {},
            },
          ];

      const payload = {
        name: newProduct.name,
        sku: showVariants ? undefined : newProduct.sku,
        category: newProduct.category,
        brand: newProduct.brand,
        variants: variantsPayload,
      };

      await api.put(`/products/${editingProductId}`, payload);
      handleCancelEdit();
      loadProducts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const categoryPrefix = categories.find((cat) => cat._id === newProduct.category)?.prefix || '';
      const brandPrefix = brands.find((brand) => brand._id === newProduct.brand)?.prefix || '';
      const basePrefix = [categoryPrefix, brandPrefix].filter(Boolean).join('-');
      
      const variantsPayload = showVariants
        ? variants.map((v) => {
            const variantSuffix = [v.color, v.size, v.material].filter(Boolean).join('-').substring(0, 10).toUpperCase();
            const fullPrefix = variantSuffix ? `${basePrefix}-${variantSuffix}` : basePrefix;
            const runningNumber = getNextRunningNumber(fullPrefix);
            const autoSku = `${fullPrefix}-${runningNumber}`;
            return {
              name: [v.color, v.size, v.material].filter(Boolean).join(' / ') || 'Default',
              sku: v.sku || autoSku,
              attributes: {
                ...(v.color && { color: v.color }),
                ...(v.size && { size: v.size }),
                ...(v.material && { material: v.material }),
              },
              price: Number(v.price) || 0,
              stockOnHand: Number(v.stockOnHand) || 0,
              leadTimeDays: Number(v.leadTimeDays) || 0,
            };
          })
        : [
            {
              sku: newProduct.sku || `${basePrefix}-${getNextRunningNumber(basePrefix)}`,
              price: Number(newProduct.price) || 0,
              stockOnHand: Number(newProduct.stockOnHand) || 0,
              leadTimeDays: Number(newProduct.leadTimeDays) || 0,
              attributes: {},
            },
          ];

      const payload = {
        name: newProduct.name,
        sku: showVariants ? undefined : newProduct.sku,
        category: newProduct.category,
        brand: newProduct.brand,
        variants: variantsPayload,
      };
      await api.post('/products', payload);
      setNewProduct(emptyProduct);
      setVariants([{ ...emptyVariant }]);
      setShowVariants(false);
      setShowNewCategoryForm(false);
      setShowNewBrandForm(false);
      loadProducts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    setSavingCategory(true);
    try {
      const res = await api.post('/categories', { name: newCategoryName, prefix: newCategoryPrefix });
      setNewProduct({ ...newProduct, category: res.data._id });
      setNewCategoryName('');
      setNewCategoryPrefix('');
      setShowNewCategoryForm(false);
      loadCategories();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create category');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleAddBrand = async () => {
    if (!newBrandName.trim()) return;
    setSavingBrand(true);
    try {
      const res = await api.post('/brands', { name: newBrandName, prefix: newBrandPrefix });
      setNewProduct({ ...newProduct, brand: res.data._id });
      setNewBrandName('');
      setNewBrandPrefix('');
      setShowNewBrandForm(false);
      loadBrands();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create brand');
    } finally {
      setSavingBrand(false);
    }
  };

  const addVariant = () => {
    setVariants([...variants, { ...emptyVariant }]);
  };

  const removeVariant = (index) => {
    if (variants.length > 1) {
      setVariants(variants.filter((_, i) => i !== index));
    }
  };

  const updateVariant = (index, field, value) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    
    // Auto-generate SKU for variant when color, size, or material changes (only when creating new)
    if (!editMode && ['color', 'size', 'material'].includes(field)) {
      const variant = updated[index];
      const categoryPrefix = categories.find((cat) => cat._id === newProduct.category)?.prefix || '';
      const brandPrefix = brands.find((brand) => brand._id === newProduct.brand)?.prefix || '';
      const basePrefix = [categoryPrefix, brandPrefix].filter(Boolean).join('-');
      const variantSuffix = [variant.color, variant.size, variant.material].filter(Boolean).join('-').substring(0, 10).toUpperCase();
      
      const fullPrefix = variantSuffix ? `${basePrefix}-${variantSuffix}` : basePrefix;
      const runningNumber = getNextRunningNumber(fullPrefix);
      
      if (fullPrefix) {
        updated[index].sku = `${fullPrefix}-${runningNumber}`;
      }
    }
    
    setVariants(updated);
  };

  const getCategoryName = (categoryId) => {
    return categories.find((cat) => cat._id === categoryId)?.name || categoryId || '-';
  };

  const getBrandName = (brandId) => {
    return brands.find((brand) => brand._id === brandId)?.name || brandId || '-';
  };

  const generateSKU = (catId, brandId) => {
    const categoryPrefix = categories.find((cat) => cat._id === (catId || newProduct.category))?.prefix || '';
    const brandPrefix = brands.find((brand) => brand._id === (brandId || newProduct.brand))?.prefix || '';
    const basePrefix = [categoryPrefix, brandPrefix].filter(Boolean).join('-');
    const runningNumber = getNextRunningNumber(basePrefix);
    return `${basePrefix}-${runningNumber}`;
  };

  const handleCategoryChange = (categoryId) => {
    const updates = { category: categoryId };
    if (!showVariants && categoryId && newProduct.brand) {
      updates.sku = generateSKU(categoryId, newProduct.brand);
    } else if (!showVariants && categoryId) {
      const categoryPrefix = categories.find((cat) => cat._id === categoryId)?.prefix || '';
      if (categoryPrefix) {
        const runningNumber = getNextRunningNumber(categoryPrefix);
        updates.sku = `${categoryPrefix}-${runningNumber}`;
      }
    }
    setNewProduct({ ...newProduct, ...updates });
  };

  const handleBrandChange = (brandId) => {
    const updates = { brand: brandId };
    if (!showVariants && brandId && newProduct.category) {
      updates.sku = generateSKU(newProduct.category, brandId);
    } else if (!showVariants && brandId) {
      const brandPrefix = brands.find((brand) => brand._id === brandId)?.prefix || '';
      if (brandPrefix) {
        const runningNumber = getNextRunningNumber(brandPrefix);
        updates.sku = `${brandPrefix}-${runningNumber}`;
      }
    }
    setNewProduct({ ...newProduct, ...updates });
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>{editMode ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
        {loading && <span>Loading...</span>}
      </div>
      {error && <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div>}

      <form onSubmit={editMode ? handleUpdate : handleCreate} style={{ marginBottom: 24 }}>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>หมวดหมู่</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                {!showNewCategoryForm ? (
                  <>
                    <select
                      className="input"
                      value={newProduct.category || ''}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">-- เลือกหมวดหมู่ --</option>
                      {categories.map((cat) => (
                        <option key={cat._id} value={cat._id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNewCategoryForm(true)}
                      style={{
                        marginTop: 4,
                        fontSize: '0.75rem',
                        padding: '2px 6px',
                        background: '#e3f2fd',
                        border: '1px solid #0066cc',
                        color: '#0066cc',
                        cursor: 'pointer',
                        borderRadius: 3,
                      }}
                    >
                      + เพิ่มใหม่
                    </button>
                  </>
                ) : (
                  <div style={{ display: 'flex', gap: 4, flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        className="input"
                        placeholder="ชื่อหมวดหมู่"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <input
                        className="input"
                        placeholder="Prefix"
                        value={newCategoryPrefix}
                        onChange={(e) => setNewCategoryPrefix(e.target.value.toUpperCase())}
                        style={{ width: '80px', textTransform: 'uppercase' }}
                        maxLength={10}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        onClick={handleAddCategory}
                        disabled={savingCategory}
                        style={{ padding: '4px 8px', cursor: 'pointer', flex: 1 }}
                        className="button"
                      >
                        {savingCategory ? '...' : 'เพิ่ม'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewCategoryForm(false);
                          setNewCategoryName('');
                          setNewCategoryPrefix('');
                        }}
                        style={{ padding: '4px 8px', background: '#ccc', border: 'none', cursor: 'pointer', borderRadius: 4 }}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>ยี่ห้อ</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                {!showNewBrandForm ? (
                  <>
                    <select
                      className="input"
                      value={newProduct.brand || ''}
                      onChange={(e) => handleBrandChange(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">-- เลือกยี่ห้อ --</option>
                      {brands.map((brand) => (
                        <option key={brand._id} value={brand._id}>
                          {brand.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNewBrandForm(true)}
                      style={{
                        marginTop: 4,
                        fontSize: '0.75rem',
                        padding: '2px 6px',
                        background: '#e3f2fd',
                        border: '1px solid #0066cc',
                        color: '#0066cc',
                        cursor: 'pointer',
                        borderRadius: 3,
                      }}
                    >
                      + เพิ่มใหม่
                    </button>
                  </>
                ) : (
                  <div style={{ display: 'flex', gap: 4, flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        className="input"
                        placeholder="ชื่อยี่ห้อ"
                        value={newBrandName}
                        onChange={(e) => setNewBrandName(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <input
                        className="input"
                        placeholder="Prefix"
                        value={newBrandPrefix}
                        onChange={(e) => setNewBrandPrefix(e.target.value.toUpperCase())}
                        style={{ width: '80px', textTransform: 'uppercase' }}
                        maxLength={10}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        onClick={handleAddBrand}
                        disabled={savingBrand}
                        style={{ padding: '4px 8px', cursor: 'pointer', flex: 1 }}
                        className="button"
                      >
                        {savingBrand ? '...' : 'เพิ่ม'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewBrandForm(false);
                          setNewBrandName('');
                          setNewBrandPrefix('');
                        }}
                        style={{ padding: '4px 8px', background: '#ccc', border: 'none', cursor: 'pointer', borderRadius: 4 }}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>ชื่อสินค้า *</label>
            <input className="input" placeholder="Name" value={newProduct.name || ''} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} required />
          </div>
          {!showVariants && (
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>SKU</label>
              <input className="input" placeholder="SKU" value={newProduct.sku || ''} onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })} />
            </div>
          )}
        
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showVariants}
              onChange={(e) => {
                setShowVariants(e.target.checked);
                // Reset price/stock/leadTime when switching variants
                if (e.target.checked) {
                  setNewProduct(prev => ({ ...prev, price: 0, stockOnHand: 0, leadTimeDays: 0 }));
                }
              }}
            />
            <span>สินค้ามีหลาย Variant (สี/ไซส์/วัสดุ)</span>
          </label>
        </div>

        {!showVariants ? (
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', marginTop: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>ราคา</label>
              <input 
                className="input" 
                type="number" 
                placeholder="Price" 
                value={newProduct.price ?? 0} 
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} 
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>คงคลัง</label>
              <input 
                className="input" 
                type="number" 
                placeholder="Stock" 
                value={newProduct.stockOnHand ?? 0} 
                onChange={(e) => setNewProduct({ ...newProduct, stockOnHand: e.target.value })} 
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>จำนวนวันที่ผลิต (Lead Time)</label>
              <input 
                className="input" 
                type="number" 
                placeholder="วัน" 
                value={newProduct.leadTimeDays ?? 0} 
                onChange={(e) => setNewProduct({ ...newProduct, leadTimeDays: e.target.value })} 
              />
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Variants</h3>
              <button type="button" className="button" onClick={addVariant} style={{ padding: '4px 12px' }}>
                + เพิ่ม Variant
              </button>
            </div>
            {variants.map((variant, idx) => (
              <div key={idx} style={{ border: '1px solid #e0e0e0', padding: 12, marginBottom: 12, borderRadius: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>Variant {idx + 1}</strong>
                  {variants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeVariant(idx)}
                      style={{ color: 'crimson', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      ลบ
                    </button>
                  )}
                </div>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>สี</label>
                    <input
                      className="input"
                      placeholder="เช่น แดง, ฟ้า"
                      value={variant.color || ''}
                      onChange={(e) => updateVariant(idx, 'color', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>ไซส์</label>
                    <input
                      className="input"
                      placeholder="เช่น S, M, L"
                      value={variant.size || ''}
                      onChange={(e) => updateVariant(idx, 'size', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>วัสดุ</label>
                    <input
                      className="input"
                      placeholder="เช่น Cotton, Polyester"
                      value={variant.material || ''}
                      onChange={(e) => updateVariant(idx, 'material', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>SKU *</label>
                    <input
                      className="input"
                      placeholder="เช่น SHIRT-RED-L"
                      value={variant.sku || ''}
                      onChange={(e) => updateVariant(idx, 'sku', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>ราคา</label>
                    <input
                      className="input"
                      type="number"
                      placeholder="Price"
                      value={variant.price ?? 0}
                      onChange={(e) => updateVariant(idx, 'price', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>คงคลัง</label>
                    <input
                      className="input"
                      type="number"
                      placeholder="Stock"
                      value={variant.stockOnHand ?? 0}
                      onChange={(e) => updateVariant(idx, 'stockOnHand', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>จำนวนวันที่ผลิต (Lead Time)</label>
                    <input
                      className="input"
                      type="number"
                      placeholder="วัน"
                      value={variant.leadTimeDays ?? 0}
                      onChange={(e) => updateVariant(idx, 'leadTimeDays', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="button" type="submit" disabled={saving} style={{ flex: 1 }}>
            {saving ? 'Saving...' : (editMode ? 'อัพเดทสินค้า' : 'เพิ่มสินค้า')}
          </button>
          {editMode && (
            <button
              type="button"
              onClick={handleCancelEdit}
              style={{
                padding: '8px 16px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                flex: 1,
              }}
            >
              ยกเลิก
            </button>
          )}
        </div>
      </form>

      <div style={{ marginTop: 24, overflowX: 'auto' }}>
        <h2 style={{ marginBottom: 16 }}>รายการสินค้า</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Brand</th>
              <th>Variants</th>
              <th>Details</th>
              <th style={{ width: '100px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p._id}>
                <td>{p.name}</td>
                <td>{getCategoryName(p.category)}</td>
                <td>{getBrandName(p.brand)}</td>
                <td>{p.variants?.length || 0}</td>
                <td>
                  {p.variants?.map((v, idx) => (
                    <div key={v._id || idx} style={{ fontSize: '0.875rem', marginBottom: 4, borderBottom: idx < p.variants.length - 1 ? '1px solid #f0f0f0' : 'none', paddingBottom: 4 }}>
                      <strong>SKU:</strong> {v.sku}
                      {v.attributes?.color && ` | สี: ${v.attributes.color}`}
                      {v.attributes?.size && ` | ไซส์: ${v.attributes.size}`}
                      {v.attributes?.material && ` | วัสดุ: ${v.attributes.material}`}
                      <br />
                      <span style={{ color: '#666' }}>ราคา: {v.price} บาท | คงคลัง: {v.stockOnHand ?? 0} ชิ้น</span>
                    </div>
                  ))}
                </td>
                <td>
                  <button
                    onClick={() => handleEdit(p)}
                    style={{
                      padding: '4px 12px',
                      background: '#0066cc',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    แก้ไข
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
