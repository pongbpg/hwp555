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
  const [skuPrefix, setSkuPrefix] = useState('');

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

  const getNextRunningNumber = (prefix) => {
    if (!prefix) return '0001';
    const matchingSKUs = [];
    products.forEach((product) => {
      product.variants?.forEach((variant) => {
        if (variant.sku?.startsWith(prefix)) {
          matchingSKUs.push(variant.sku);
        }
      });
    });
    if (matchingSKUs.length === 0) return '0001';
    const runningNumbers = matchingSKUs
      .map((sku) => {
        const parts = sku.split('-');
        const lastPart = parts[parts.length - 1];
        const num = parseInt(lastPart, 10);
        return isNaN(num) ? 0 : num;
      })
      .filter((num) => num > 0);
    if (runningNumbers.length === 0) return '0001';
    const maxNumber = Math.max(...runningNumbers);
    return (maxNumber + 1).toString().padStart(4, '0');
  };

  const parseCSVFile = (csvContent) => {
    const lines = csvContent.trim().split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) {
      setError('ไฟล์ CSV ต้องมีข้อมูลอย่างน้อย 2 แถว');
      return null;
    }

    // แถวแรก: ชื่อสินค้า
    const productName = lines[0];

    // แถวที่สอง: ส่วนหัว (variant codes)
    const headerLine = lines[1];
    const variantCodes = headerLine.split(',').map((code) => code.trim());

    if (variantCodes[0].toUpperCase() === 'SKP') {
      variantCodes.shift();
    }

    if (variantCodes.length === 0) {
      setError('ไม่พบ variant codes ในไฟล์ CSV');
      return null;
    }

    const parsedVariants = [];
    const dataRows = lines.slice(2);

    // เก็บข้อมูลแต่ละแถว
    const rowData = {};
    dataRows.forEach((line) => {
      const parts = line.split(',').map((part) => part.trim());
      if (parts.length > 0) {
        const rowLabel = parts[0];
        rowData[rowLabel] = parts.slice(1);
      }
    });

    // สร้าง variants จาก variant codes
    variantCodes.forEach((code, idx) => {
      const variant = {
        sku: code,
        color: '',
        size: '',
        material: '',
        price: 0,
        stockOnHand: 0,
        leadTimeDays: 0,
      };

      // ตรวจหา leadtime
      if (rowData['ระยะเวลารอคอย'] && rowData['ระยะเวลารอคอย'][idx]) {
        variant.leadTimeDays = parseInt(rowData['ระยะเวลารอคอย'][idx], 10) || 0;
      }

      // ตรวจหา stock/คงเหลือ
      if (rowData['คงเหลือ'] && rowData['คงเหลือ'][idx]) {
        variant.stockOnHand = parseFloat(rowData['คงเหลือ'][idx]) || 0;
      }

      // พยายามแยก variant code เป็น color/size/material
      const codeParts = code.split('/');
      if (codeParts.length === 2) {
        // ถ้ามีสลาช เช่น "B/M"
        variant.color = codeParts[0];
        variant.size = codeParts[1];
      } else if (codeParts.length > 2) {
        // ถ้ามีหลาย parts
        variant.color = codeParts[0];
        variant.size = codeParts.slice(1).join('/');
      } else {
        // ถ้าเป็น single code
        variant.size = code;
      }

      parsedVariants.push(variant);
    });

    return {
      productName,
      variants: parsedVariants,
    };
  };

  const handleCSVImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csvContent = event.target?.result;
        const parsed = parseCSVFile(csvContent);
        if (parsed) {
          setNewProduct((prev) => ({ ...prev, name: parsed.productName }));
          setVariants(parsed.variants);
          setShowVariants(true);
          setError('');
        }
      } catch (err) {
        setError(`เกิดข้อผิดพลาดในการอ่านไฟล์: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

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

  useEffect(() => {
    if (!editMode && showVariants && (newProduct.category || newProduct.brand || skuPrefix)) {
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
        
        let sku = '';
        if (skuPrefix) {
          // ถ้ามี skuPrefix ให้เป็น basePrefix-color-size-material-SKU_PREFIX
          sku = `${fullPrefix}-${skuPrefix}`;
        } else {
          // ไม่มี skuPrefix ให้ใช้ running number
          const runningNumber = getNextRunningNumber(fullPrefix);
          sku = `${fullPrefix}-${runningNumber}`;
        }
        
        return { ...variant, sku };
      });
      setVariants(updatedVariants);
    }
  }, [newProduct.category, newProduct.brand, showVariants, products, editMode, skuPrefix]);

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
    
    // ตั้งค่า skuPrefix จากส่วนแรกของ SKU
    if (product.sku) {
      setSkuPrefix(product.sku);
    } else {
      setSkuPrefix('');
    }

    const hasVariants =
      product.variants?.length > 1 ||
      (product.variants?.length === 1 &&
        (product.variants[0].attributes?.color ||
          product.variants[0].attributes?.size ||
          product.variants[0].attributes?.material));

    setShowVariants(hasVariants);

    if (hasVariants) {
      const loadedVariants = product.variants.map((v) => ({
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
    setSkuPrefix('');
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    const confirmed = window.confirm(`ยืนยันการอัพเดทสินค้า: ${newProduct.name || '(ไม่มีชื่อ)'} ?`);
    if (!confirmed) return;
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
            
            let autoSku = '';
            if (skuPrefix) {
              // ถ้ามี skuPrefix ให้เป็น basePrefix-color-size-material-SKU_PREFIX
              autoSku = `${fullPrefix}-${skuPrefix}`;
            } else {
              // ไม่มี skuPrefix ให้ใช้ running number
              const runningNumber = getNextRunningNumber(fullPrefix);
              autoSku = `${fullPrefix}-${runningNumber}`;
            }
            
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
    const confirmed = window.confirm(`ยืนยันการเพิ่มสินค้า: ${newProduct.name || '(ไม่มีชื่อ)'} ?`);
    if (!confirmed) return;
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
            
            let autoSku = '';
            if (skuPrefix) {
              // ถ้ามี skuPrefix ให้เป็น basePrefix-color-size-material-SKU_PREFIX
              autoSku = `${fullPrefix}-${skuPrefix}`;
            } else {
              // ไม่มี skuPrefix ให้ใช้ running number
              const runningNumber = getNextRunningNumber(fullPrefix);
              autoSku = `${fullPrefix}-${runningNumber}`;
            }
            
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
      setSkuPrefix('');
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
    if (variants.length > 0) {
      const lastVariant = variants[variants.length - 1];
      setVariants([...variants, { ...lastVariant }]);
    } else {
      setVariants([...variants, { ...emptyVariant }]);
    }
  };

  const removeVariant = (index) => {
    if (variants.length > 1) {
      setVariants(variants.filter((_, i) => i !== index));
    }
  };

  const updateVariant = (index, field, value) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };

    if (!editMode && ['color', 'size', 'material'].includes(field)) {
      const variant = updated[index];
      const categoryPrefix = categories.find((cat) => cat._id === newProduct.category)?.prefix || '';
      const brandPrefix = brands.find((brand) => brand._id === newProduct.brand)?.prefix || '';
      const basePrefix = [categoryPrefix, brandPrefix].filter(Boolean).join('-');
      const variantSuffix = [variant.color, variant.size, variant.material].filter(Boolean).join('-').substring(0, 10).toUpperCase();
      const fullPrefix = variantSuffix ? `${basePrefix}-${variantSuffix}` : basePrefix;
      
      let sku = '';
      if (skuPrefix) {
        // ถ้ามี skuPrefix ให้เป็น basePrefix-color-size-material-SKU_PREFIX
        sku = `${fullPrefix}-${skuPrefix}`;
      } else {
        // ไม่มี skuPrefix ให้ใช้ running number
        const runningNumber = getNextRunningNumber(fullPrefix);
        sku = `${fullPrefix}-${runningNumber}`;
      }
      
      if (fullPrefix) {
        updated[index].sku = sku;
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">
          {editMode ? '✏️ แก้ไขสินค้า' : '📦 เพิ่มสินค้าใหม่'}
        </h1>
        {loading && <span className="text-gray-500">Loading...</span>}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">{error}</div>}

      {/* Product Form */}
      <div className="bg-white rounded-xl shadow p-6">
        <form onSubmit={editMode ? handleUpdate : handleCreate}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมวดหมู่</label>
              {!showNewCategoryForm ? (
                <div>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newProduct.category || ''}
                    onChange={(e) => handleCategoryChange(e.target.value)}
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
                    className="mt-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    + เพิ่มใหม่
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="ชื่อหมวดหมู่"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                    <input
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm uppercase"
                      placeholder="Prefix"
                      value={newCategoryPrefix}
                      onChange={(e) => setNewCategoryPrefix(e.target.value.toUpperCase())}
                      maxLength={10}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      disabled={savingCategory}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
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
                      className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Brand */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ยี่ห้อ</label>
              {!showNewBrandForm ? (
                <div>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newProduct.brand || ''}
                    onChange={(e) => handleBrandChange(e.target.value)}
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
                    className="mt-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    + เพิ่มใหม่
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="ชื่อยี่ห้อ"
                      value={newBrandName}
                      onChange={(e) => setNewBrandName(e.target.value)}
                    />
                    <input
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm uppercase"
                      placeholder="Prefix"
                      value={newBrandPrefix}
                      onChange={(e) => setNewBrandPrefix(e.target.value.toUpperCase())}
                      maxLength={10}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddBrand}
                      disabled={savingBrand}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
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
                      className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Product Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อสินค้า *</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Name"
                value={newProduct.name || ''}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                required
              />
            </div>

            {/* SKU Prefix (for variants) */}
            {showVariants && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU Prefix (ตัวอักษรนำหน้า)</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  placeholder="เช่น SHIRT หรือเว้นว่างให้ใช้ prefix จาก category/brand"
                  value={skuPrefix || ''}
                  onChange={(e) => setSkuPrefix(e.target.value.toUpperCase())}
                />
                <p className="text-xs text-gray-500 mt-1">ถ้าใส่ค่านี้จะใช้เป็น prefix สำหรับ SKU variant โดยไม่มี running number</p>
              </div>
            )}

            {/* SKU (if no variants) */}
            {!showVariants && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  placeholder="SKU"
                  value={newProduct.sku || ''}
                  onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                />
              </div>
            )}
          </div>

          {/* Variants Toggle */}
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                checked={showVariants}
                onChange={(e) => {
                  setShowVariants(e.target.checked);
                  if (e.target.checked) {
                    setNewProduct((prev) => ({ ...prev, price: 0, stockOnHand: 0, leadTimeDays: 0 }));
                  }
                }}
              />
              <span className="text-sm text-gray-700">สินค้ามีหลาย Variant (สี/ไซส์/วัสดุ)</span>
            </label>

            {/* CSV Import Button */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg cursor-pointer font-medium text-sm transition">
                <span>📤 นำเข้าจากไฟล์ CSV</span>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVImport}
                  className="hidden"
                />
              </label>
              <span className="text-xs text-gray-500">
                (ไฟล์ CSV: ชื่อสินค้า, ตัวเลือก (SKP,B/M,B/L,...)ระยะเวลารอคอย, คงเหลือ)
              </span>
            </div>
          </div>

          {/* Non-variant fields */}
          {!showVariants ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ราคา</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  type="number"
                  placeholder="Price"
                  value={newProduct.price ?? 0}
                  onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">คงคลัง</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  type="number"
                  placeholder="Stock"
                  value={newProduct.stockOnHand ?? 0}
                  onChange={(e) => setNewProduct({ ...newProduct, stockOnHand: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนวันที่ผลิต (Lead Time)</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  type="number"
                  placeholder="วัน"
                  value={newProduct.leadTimeDays ?? 0}
                  onChange={(e) => setNewProduct({ ...newProduct, leadTimeDays: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <h3 className="text-lg font-semibold text-gray-700 mb-3">Variants</h3>

              {variants.map((variant, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4 mb-3 bg-gray-50">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-medium text-gray-700">Variant {idx + 1}</span>
                    {variants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeVariant(idx)}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        ลบ
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">สี</label>
                      <input
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        placeholder="เช่น แดง, ฟ้า"
                        value={variant.color || ''}
                        onChange={(e) => updateVariant(idx, 'color', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">ไซส์</label>
                      <input
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        placeholder="เช่น S, M, L"
                        value={variant.size || ''}
                        onChange={(e) => updateVariant(idx, 'size', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">วัสดุ</label>
                      <input
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        placeholder="เช่น Cotton"
                        value={variant.material || ''}
                        onChange={(e) => updateVariant(idx, 'material', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">SKU *</label>
                      <input
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                        placeholder="เช่น SHIRT-RED-L"
                        value={variant.sku || ''}
                        onChange={(e) => updateVariant(idx, 'sku', e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">ราคา</label>
                      <input
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        type="number"
                        placeholder="Price"
                        value={variant.price ?? 0}
                        onChange={(e) => updateVariant(idx, 'price', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">คงคลัง</label>
                      <input
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        type="number"
                        placeholder="Stock"
                        value={variant.stockOnHand ?? 0}
                        onChange={(e) => updateVariant(idx, 'stockOnHand', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Lead Time (วัน)</label>
                      <input
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        type="number"
                        placeholder="วัน"
                        value={variant.leadTimeDays ?? 0}
                        onChange={(e) => updateVariant(idx, 'leadTimeDays', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              <button
                type="button"
                className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium mt-3"
                onClick={addVariant}
              >
                + เพิ่ม Variant
              </button>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex gap-3 mt-8">
            {editMode && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="flex-1 bg-gray-400 hover:bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold text-lg"
              >
                ยกเลิก
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white px-8 py-3 rounded-lg font-bold text-lg shadow-lg disabled:opacity-50 transition-all"
            >
              {saving ? 'กำลังบันทึก...' : editMode ? '✅ อัพเดทสินค้า' : '✅ เพิ่มสินค้า'}
            </button>
          </div>
        </form>
      </div>

      {/* Products List */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">📋 รายการสินค้า</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">Name</th>
                <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">Category</th>
                <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">Brand</th>
                <th className="text-center py-2 px-3 text-sm font-semibold text-gray-600">Variants</th>
                <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">Details</th>
                <th className="text-center py-2 px-3 text-sm font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p._id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 text-sm font-medium">{p.name}</td>
                  <td className="py-2 px-3 text-sm text-gray-600">{getCategoryName(p.category)}</td>
                  <td className="py-2 px-3 text-sm text-gray-600">{getBrandName(p.brand)}</td>
                  <td className="py-2 px-3 text-sm text-center">{p.variants?.length || 0}</td>
                  <td className="py-2 px-3">
                    {p.variants?.map((v, idx) => (
                      <div
                        key={v._id || idx}
                        className={`text-xs mb-1 pb-1 ${idx < p.variants.length - 1 ? 'border-b border-gray-100' : ''}`}
                      >
                        <span className="font-medium">SKU:</span>{' '}
                        <span className="font-mono text-gray-600">{v.sku}</span>
                        {v.attributes?.color && ` | สี: ${v.attributes.color}`}
                        {v.attributes?.size && ` | ไซส์: ${v.attributes.size}`}
                        {v.attributes?.material && ` | วัสดุ: ${v.attributes.material}`}
                        <br />
                        <span className="text-gray-500">
                          ราคา: {v.price} บาท | คงคลัง: {v.stockOnHand ?? 0} ชิ้น
                        </span>
                      </div>
                    ))}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button
                      onClick={() => handleEdit(p)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                    >
                      แก้ไข
                    </button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    ไม่มีสินค้า
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
