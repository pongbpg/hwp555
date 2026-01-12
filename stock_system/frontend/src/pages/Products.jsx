import { useEffect, useState } from 'react';
import api from '../api.js';

const emptyProduct = {
  name: '',
  sku: '',
  category: '',
  brand: '',
  price: 0,
  leadTimeDays: 7,
  reorderBufferDays: 7,
  minOrderQty: 0,
  status: 'active',
  enableStockAlerts: true,
  skuProduct: '',
};

const emptyVariant = {
  sku: '',
  model: '',
  color: '',
  size: '',
  material: '',
  price: 0,
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
  const [skuProduct, setSkuProduct] = useState('');
  const [defaultPrice, setDefaultPrice] = useState(0);
  const [costingMethod, setCostingMethod] = useState('FIFO');
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [expandedProductId, setExpandedProductId] = useState(null);

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

  const generateRunningNumber = (prefix) => {
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

    // ตรวจสอบรูปแบบ: แถวแรก คอลัมน์แรก เป็นค่าว่าง = รูปแบบใหม่
    const firstLineColumns = lines[0].split(',').map((col) => col.trim());
    const isNewFormat = !firstLineColumns[0]; // A1 เป็นค่าว่าง
    
    let variantCodes = [];
    let stockData = [];
    let productName = 'สินค้า';

    if (isNewFormat) {
      // รูปแบบใหม่: 
      // แถวแรก: (empty),B/2XS,B/XS,B/S,...
      // แถวที่สอง: คงเหลือ,71.00,184.00,...
      variantCodes = firstLineColumns.slice(1).filter(Boolean); // ข้าม A1 ที่เป็นค่าว่าง

      // หา row ที่มี "คงเหลือ"
      lines.slice(1).forEach((line) => {
        const parts = line.split(',').map((part) => part.trim());
        if (parts[0] === 'คงเหลือ') {
          stockData = parts.slice(1);
        }
      });
    } else {
      // รูปแบบเก่า (ถ้ามี): แถวแรก = ชื่อสินค้า
      productName = firstLineColumns[0] || 'สินค้า';
      const headerLine = lines[1];
      variantCodes = headerLine.split(',').map((code) => code.trim());

     

      // หา row ที่มี "คงเหลือ"
      lines.slice(2).forEach((line) => {
        const parts = line.split(',').map((part) => part.trim());
        if (parts[0] === 'คงเหลือ') {
          stockData = parts.slice(1);
        }
      });
    }

    if (variantCodes.length === 0) {
      setError('ไม่พบ variant codes ในไฟล์ CSV');
      return null;
    }

    const parsedVariants = [];

    // สร้าง variants จาก variant codes
    variantCodes.forEach((code, idx) => {
      const variant = {
        sku: '',
        model: '',
        color: '',
        size: '',
        material: '',
        price: 0,
        stockOnHand: 0,
      };

      // ตรวจหา stock/คงเหลือ
      if (stockData && stockData[idx]) {
        variant.stockOnHand = parseFloat(stockData[idx]) || 0;
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
      const basePrefix = getBasePrefix(newProduct.brand, newProduct.category);
      if (basePrefix) {
        const generatedSKU = generateSingleProductSKU(basePrefix);
        if (newProduct.sku !== generatedSKU) {
          setNewProduct((prev) => ({ ...prev, sku: generatedSKU }));
        }
      }
    }
  }, [newProduct.category, newProduct.brand, showVariants, categories, brands, products, editMode]);

  useEffect(() => {
    if (showVariants && !editMode) {
      // ✅ เฉพาะตอน create ใหม่ ไม่ใช่ตอนแก้ไข เพื่อไม่ให้ batches หาย
      const updatedVariants = variants.map((variant) => {
        const isNewVariant = !variant._id;
        
        // variant เก่า (มี _id) ให้คงไว้ ไม่ auto-generate
        if (!isNewVariant && variant.sku) {
          return variant;
        }

        // variant ใหม่ หรือไม่มี SKU ให้ generate
        if (isNewVariant || !variant.sku) {
          const sku = generateVariantSKU(
            newProduct.brand,
            newProduct.category,
            skuProduct,
            variant.model,
            variant.color,
            variant.size,
            variant.material
          );
          // ✅ เมื่อ generate SKU ต้องรักษา batches ไว้
          return { ...variant, sku: sku || variant.sku, batches: variant.batches };
        }

        return variant;
      });
      setVariants(updatedVariants);
    }
  }, [newProduct.category, newProduct.brand, showVariants, editMode, skuProduct, brands, categories]);

  const handleEdit = (product) => {
    setEditMode(true);
    setEditingProductId(product._id);
    setNewProduct({
      name: product.name || '',
      sku: product.sku || '',
      category: product.category || '',
      brand: product.brand || '',
      price: product.variants?.[0]?.price || 0,
      leadTimeDays: product.leadTimeDays ?? 7,
      reorderBufferDays: product.reorderBufferDays ?? 7,
      minOrderQty: product.minOrderQty ?? 0,
      status: product.status || 'active',
      enableStockAlerts: product.enableStockAlerts ?? true,
      skuProduct: product.skuProduct || '',
    });
    setCostingMethod(product.costingMethod || 'FIFO');
    setSkuProduct(product.skuProduct || '');

    const hasVariants =
      product.variants?.length > 1 ||
      (product.variants?.length === 1 &&
        (product.variants[0].attributes?.color ||
          product.variants[0].attributes?.size ||
          product.variants[0].attributes?.material));

    setShowVariants(hasVariants);

    // ✅ ALWAYS load variant data with _id and batches, regardless of hasVariants
    if (product.variants && product.variants.length > 0) {
      const loadedVariants = product.variants.map((v) => ({
        _id: v._id || null,
        sku: v.sku || '',
        model: v.model || '',
        color: v.attributes?.color || '',
        size: v.attributes?.size || '',
        material: v.attributes?.material || '',
        price: v.price ?? 0,
        batches: v.batches || [],
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
    setSkuProduct('');
    setIsFormExpanded(false);
  };

  const collapseForm = () => {
    handleCancelEdit();
  };

  const applyDefaultsToAllVariants = () => {
    const updated = variants.map((v) => ({
      ...v,
      price: defaultPrice || v.price,
    }));
    setVariants(updated);
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
            return {
              ...(v._id && { _id: v._id }),  // ✅ เก็บ _id เดิม
              name: [v.model, v.color, v.size, v.material].filter(Boolean).join(' / ') || 'Default',
              sku: v.sku,
              model: v.model,
              attributes: {
                ...(v.color && { color: v.color }),
                ...(v.size && { size: v.size }),
                ...(v.material && { material: v.material }),
              },
              price: Number(v.price) || 0,
              // ✅ ไม่ส่ง batches เลย ให้ backend preserve เอง
            };
          })
        : [
            {
              // ✅ FIX: For single variant, still send _id so backend preserves batches
              ...(variants[0]?._id && { _id: variants[0]._id }),
              sku: newProduct.sku,
              price: Number(newProduct.price) || 0,
              attributes: {},
            },
          ];

      const payload = {
        name: newProduct.name,
        sku: showVariants ? undefined : newProduct.sku,
        category: newProduct.category,
        brand: newProduct.brand,
        variants: variantsPayload,
        skuProduct: showVariants ? skuProduct : '',
        costingMethod,
        leadTimeDays: Number(newProduct.leadTimeDays) || 7,
        reorderBufferDays: Number(newProduct.reorderBufferDays) || 7,
        minOrderQty: Number(newProduct.minOrderQty) || 0,
        status: newProduct.status || 'active',
        enableStockAlerts: newProduct.enableStockAlerts ?? true,
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
      const variantsPayload = showVariants
        ? variants.map((v) => {
            return {
              ...(v._id && { _id: v._id }),  // ✅ preserve variant ID if exists
              name: [v.model, v.color, v.size, v.material].filter(Boolean).join(' / ') || 'Default',
              sku: v.sku,
              model: v.model,
              attributes: {
                ...(v.color && { color: v.color }),
                ...(v.size && { size: v.size }),
                ...(v.material && { material: v.material }),
              },
              price: Number(v.price) || 0,
            };
          })
        : [
            {
              sku: newProduct.sku,
              price: Number(newProduct.price) || 0,
              attributes: {},
            },
          ];

      const payload = {
        name: newProduct.name,
        sku: showVariants ? undefined : newProduct.sku,
        category: newProduct.category,
        brand: newProduct.brand,
        variants: variantsPayload,
        skuProduct: showVariants ? skuProduct : '',
        costingMethod,
        leadTimeDays: Number(newProduct.leadTimeDays) || 7,
        reorderBufferDays: Number(newProduct.reorderBufferDays) || 7,
        minOrderQty: Number(newProduct.minOrderQty) || 0,
        status: newProduct.status || 'active',
        enableStockAlerts: newProduct.enableStockAlerts ?? true,
      };
      await api.post('/products', payload);
      setNewProduct(emptyProduct);
      setVariants([{ ...emptyVariant }]);
      setShowVariants(false);
      setShowNewCategoryForm(false);
      setShowNewBrandForm(false);
      setSkuProduct('');
      setCostingMethod('FIFO');
      setIsFormExpanded(false);
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
      // ใหม่ variant ต้องไม่มี _id เพื่อให้ useEffect รู้ว่ามันเป็น variant ใหม่
      const { _id, ...variantWithoutId } = lastVariant;
      setVariants([...variants, { ...variantWithoutId, sku: '' }]);
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

    // เฉพาะ variant ใหม่เท่านั้นที่ให้ auto-generate SKU
    const isNewVariant = !updated[index]._id;
    const attributeFields = ['model', 'color', 'size', 'material'];
    
    if (isNewVariant && attributeFields.includes(field)) {
      const variant = updated[index];
      const sku = generateVariantSKU(
        newProduct.brand,
        newProduct.category,
        skuProduct,
        variant.model,
        variant.color,
        variant.size,
        variant.material
      );
      if (sku) {
        updated[index].sku = sku;
      }
    }
    
    // ✅ ยังคง batches ให้อยู่
    setVariants(updated);
  };

  // ========== Helper Functions ==========
  
  // ดึงชื่อหมวดหมู่
  const getCategoryName = (categoryId) => {
    return categories.find((cat) => cat._id === categoryId)?.name || categoryId || '-';
  };

  // ดึงชื่อยี่ห้อ
  const getBrandName = (brandId) => {
    return brands.find((brand) => brand._id === brandId)?.name || brandId || '-';
  };

  // ดึง prefix ของ brand และ category
  const getPrefixes = (brandId, categoryId) => {
    const brandPrefix = brands.find((brand) => brand._id === brandId)?.prefix || '';
    const categoryPrefix = categories.find((cat) => cat._id === categoryId)?.prefix || '';
    return { brandPrefix, categoryPrefix };
  };

  // สร้าง base prefix (Brand-Category)
  const getBasePrefix = (brandId, categoryId) => {
    const { brandPrefix, categoryPrefix } = getPrefixes(brandId, categoryId);
    return [brandPrefix, categoryPrefix].filter(Boolean).join('-');
  };

  // สร้าง SKU สำหรับ single product
  const generateSingleProductSKU = (basePrefix) => {
    const runningNumber = generateRunningNumber(basePrefix);
    return `${basePrefix}-${runningNumber}`;
  };

  // สร้าง SKU สำหรับ variant
  const generateVariantSKU = (brandId, categoryId, skuProductValue, model, color, size, material) => {
    const { brandPrefix, categoryPrefix } = getPrefixes(brandId, categoryId);
    const skuParts = [
      brandPrefix,
      categoryPrefix,
      skuProductValue,
      model,
      color,
      size,
      material,
    ].filter(Boolean);
    
    return skuParts.length > 0 ? skuParts.join('-').toUpperCase() : '';
  };

  // ========== End Helper Functions ==========

  const handleCategoryChange = (categoryId) => {
    const updates = { category: categoryId };
    
    // อัพเดท SKU สำหรับ single product
    if (!showVariants && categoryId && newProduct.brand) {
      const newBasePrefix = getBasePrefix(newProduct.brand, categoryId);
      const oldBasePrefix = getBasePrefix(newProduct.brand, newProduct.category);
      
      // เก็บ suffix จาก SKU เดิม
      const oldSku = newProduct.sku || '';
      let suffix = '';
      if (oldBasePrefix && oldSku.startsWith(oldBasePrefix + '-')) {
        suffix = oldSku.substring(oldBasePrefix.length + 1);
      }
      
      // สร้าง SKU ใหม่
      if (suffix) {
        updates.sku = `${newBasePrefix}-${suffix}`;
      } else {
        const runningNumber = generateRunningNumber(newBasePrefix);
        updates.sku = `${newBasePrefix}-${runningNumber}`;
      }
    } else if (!showVariants && categoryId) {
      const categoryPrefix = categories.find((cat) => cat._id === categoryId)?.prefix || '';
      if (categoryPrefix) {
        const runningNumber = generateRunningNumber(categoryPrefix);
        updates.sku = `${categoryPrefix}-${runningNumber}`;
      }
    }
    
    // อัพเดท variant SKU
    if (showVariants && categoryId) {
      const newBasePrefix = getBasePrefix(newProduct.brand, categoryId);
      const oldBasePrefix = getBasePrefix(newProduct.brand, newProduct.category);
      
      const updatedVariants = variants.map((variant) => {
        const oldVariantSku = variant.sku || '';
        
        // เก็บ suffix จาก SKU เดิม
        let suffix = '';
        if (oldBasePrefix && oldVariantSku.startsWith(oldBasePrefix + '-')) {
          suffix = oldVariantSku.substring(oldBasePrefix.length + 1);
        }
        
        // สร้าง SKU ใหม่
        const newSku = suffix ? `${newBasePrefix}-${suffix}` : oldVariantSku;
        return { ...variant, sku: newSku };
      });
      setVariants(updatedVariants);
    }
    
    setNewProduct({ ...newProduct, ...updates });
  };

  const handleBrandChange = (brandId) => {
    const updates = { brand: brandId };
    
    // อัพเดท SKU สำหรับ single product
    if (!showVariants && brandId && newProduct.category) {
      const newBasePrefix = getBasePrefix(brandId, newProduct.category);
      const oldBasePrefix = getBasePrefix(newProduct.brand, newProduct.category);
      
      // เก็บ suffix จาก SKU เดิม
      const oldSku = newProduct.sku || '';
      let suffix = '';
      if (oldBasePrefix && oldSku.startsWith(oldBasePrefix + '-')) {
        suffix = oldSku.substring(oldBasePrefix.length + 1);
      }
      
      // สร้าง SKU ใหม่
      if (suffix) {
        updates.sku = `${newBasePrefix}-${suffix}`;
      } else {
        const runningNumber = generateRunningNumber(newBasePrefix);
        updates.sku = `${newBasePrefix}-${runningNumber}`;
      }
    } else if (!showVariants && brandId) {
      const brandPrefix = brands.find((brand) => brand._id === brandId)?.prefix || '';
      if (brandPrefix) {
        const runningNumber = generateRunningNumber(brandPrefix);
        updates.sku = `${brandPrefix}-${runningNumber}`;
      }
    }
    
    // อัพเดท variant SKU
    if (showVariants && brandId) {
      const newBasePrefix = getBasePrefix(brandId, newProduct.category);
      const oldBasePrefix = getBasePrefix(newProduct.brand, newProduct.category);
      
      const updatedVariants = variants.map((variant) => {
        const oldVariantSku = variant.sku || '';
        
        // เก็บ suffix จาก SKU เดิม
        let suffix = '';
        if (oldBasePrefix && oldVariantSku.startsWith(oldBasePrefix + '-')) {
          suffix = oldVariantSku.substring(oldBasePrefix.length + 1);
        }
        
        // สร้าง SKU ใหม่
        const newSku = suffix ? `${newBasePrefix}-${suffix}` : oldVariantSku;
        return { ...variant, sku: newSku };
      });
      setVariants(updatedVariants);
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

      {/* Product Form Button (Collapsible Header) */}
      <button
        onClick={() => {
          if (editMode) {
            handleCancelEdit();
          } else {
            setIsFormExpanded(!isFormExpanded);
          }
        }}
        className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-4 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-between"
      >
        <span>{editMode ? '✏️ แก้ไขสินค้า' : '➕ เพิ่มสินค้าใหม่'}</span>
        <span className={`transform transition-transform ${isFormExpanded || editMode ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Product Form */}
      {(isFormExpanded || editMode) && (
        <div className="bg-white rounded-xl shadow p-6 animate-in fade-in duration-300">
          <form onSubmit={editMode ? handleUpdate : handleCreate}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Brand */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ยี่ห้อ</label>
              {!showNewBrandForm ? (
                <div>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newProduct.brand ?? ''}
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
                      onChange={(e) => setNewBrandPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
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

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมวดหมู่</label>
              {!showNewCategoryForm ? (
                <div>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newProduct.category ?? ''}
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
                      onChange={(e) => setNewCategoryPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
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

            {/* Product Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อสินค้า *</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Name"
                value={newProduct.name ?? ''}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value.toUpperCase().replace(/[\/\\@#$%^&*()+=[{};:'"<>,.?]/g, '') })}
                required
              />
            </div>

            {/* SKU Product (for variants) */}
            {showVariants && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU Product (ชื่อสินค้าลัด)</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  placeholder="เช่น IP (iPhone) หรือเว้นว่างให้ใช้ color-size-material"
                  value={skuProduct ?? ''}
                  onChange={(e) => setSkuProduct(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                />
                <p className="text-xs text-gray-500 mt-1">ชื่อลัดสินค้า ที่จะแสดงหลัง Brand-Category (เช่น APPL-MOBI-IP)</p>
              </div>
            )}

            {/* SKU (if no variants) */}
            {!showVariants && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  placeholder="SKU"
                  value={newProduct.sku ?? ''}
                  onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value.toUpperCase().replace(/[^A-Z0-9\-]/g, '') })}
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
                    setNewProduct((prev) => ({ ...prev, price: 0 }));
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
                (ไฟล์ CSV: คอลัมน์ 1 ว่าง, ตัวเลือก (B/M,B/L,...), คงเหลือ)
              </span>
            </div>
          </div>

          {/* Default Price (for variants) */}
          {showVariants && variants.length > 0 && (
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">📋 ตั้งค่าราคาเดียวให้ทั้งหมด</h3>
              <div className="grid grid-cols-1 gap-4 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ราคาขาย</label>
                  <input
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    type="number"
                    placeholder="ราคาขาย"
                    value={defaultPrice ?? ''}
                    onChange={(e) => setDefaultPrice(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={applyDefaultsToAllVariants}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                ✓ ก็อบค่านี้ไปยัง Variant ทั้งหมด
              </button>
            </div>
          )}

          {/* Non-variant fields */}
          {!showVariants ? (
            <div className="grid grid-cols-1 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ราคาขาย</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  type="number"
                  placeholder="ราคาขาย"
                  value={newProduct.price ?? 0}
                  onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
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
                    {variants.length > 1 && !variant._id && (
                      <button
                        type="button"
                        onClick={() => removeVariant(idx)}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        ลบ
                      </button>
                    )}
                  </div>

                  {/* แสดง batches ที่มีอยู่ */}
                  {variant._id && variant.batches && Array.isArray(variant.batches) && variant.batches.length > 0 && (
                    <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded">
                      <div className="text-xs font-semibold text-blue-700 mb-1">📦 Batches ({variant.batches.length}):</div>
                      {variant.batches.map((batch, bIdx) => (
                        <div key={bIdx} className="text-xs text-blue-600 py-0.5">
                          • {batch.batchRef}: qty={batch.quantity}, cost={batch.cost}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Debug: ถ้าไม่มี batches บอก why */}
                  {variant._id && (!variant.batches || variant.batches.length === 0) && (
                    <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                      <div className="text-xs font-semibold text-yellow-700">ℹ️ ไม่มี batches</div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">รุ่น</label>
                      <input
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        placeholder="เช่น AIRMAX90"
                        value={variant.model || ''}
                        onChange={(e) => updateVariant(idx, 'model', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">สี</label>
                      <input
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        placeholder="เช่น RED, BLUE"
                        value={variant.color || ''}
                        onChange={(e) => updateVariant(idx, 'color', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">ไซส์</label>
                      <input
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        placeholder="เช่น S, M, L"
                        value={variant.size || ''}
                        onChange={(e) => updateVariant(idx, 'size', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">วัสดุ</label>
                      <input
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        placeholder="เช่น COTTON"
                        value={variant.material || ''}
                        onChange={(e) => updateVariant(idx, 'material', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">SKU *</label>
                      <input
                        className={`w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono ${
                          variant._id ? 'bg-gray-200 cursor-not-allowed' : ''
                        }`}
                        placeholder="เช่น SHIRT-RED-L"
                        value={variant.sku || ''}
                        onChange={(e) => updateVariant(idx, 'sku', e.target.value.toUpperCase().replace(/[^A-Z0-9\-]/g, ''))}
                        disabled={!!variant._id}
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

          {/* Lead Time, Reorder Buffer Days and Min Order Qty */}
          <div className="mt-6 border-t pt-6">
            {/* Row 1: Costing Method & Min Order Qty */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วิธีคำนวณต้นทุน</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={costingMethod}
                  onChange={(e) => setCostingMethod(e.target.value)}
                >
                  <option value="FIFO">FIFO - สินค้าเก่าออกก่อน (อาหาร/ยา)</option>
                  <option value="LIFO">LIFO - สินค้าใหม่ออกก่อน (ราคาผันผวน)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">คำนวณมูลค่าสต็อก & ตัดสต็อกเมื่อขาย</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนสั่งซื้อขั้นต่ำ (MOQ)</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  type="number"
                  placeholder="จำนวนชิ้น (หรือ 0 ไม่มี MOQ)"
                  value={newProduct.minOrderQty ?? 0}
                  onChange={(e) => setNewProduct({ ...newProduct, minOrderQty: parseInt(e.target.value) || 0 })}
                  min="0"
                />
                <p className="text-xs text-gray-500 mt-1">จำนวนต่ำสุดที่ต้องสั่งซื้อ</p>
              </div>
            </div>

            {/* Row 2: Status & Enable Stock Alerts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">สถานะสินค้า</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={newProduct.status ?? 'active'}
                  onChange={(e) => setNewProduct({ ...newProduct, status: e.target.value })}
                >
                  <option value="active">✅ ใช้งาน</option>
                  <option value="archived">📦 หยุดใช้งาน</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">หยุดใช้งาน = ไม่แสดงในช่องสั่งซื้อ</p>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <input
                    id="enableStockAlerts"
                    type="checkbox"
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    checked={newProduct.enableStockAlerts === true}
                    onChange={(e) => setNewProduct({ ...newProduct, enableStockAlerts: e.target.checked })}
                  />
                  <label htmlFor="enableStockAlerts" className="text-sm font-medium text-gray-700 cursor-pointer">
                    🔔 เปิดการแจ้งเตือนสต็อกต่ำ
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1">ปิด = ไม่แจ้งเตือนเมื่อสต็อกต่ำ</p>
              </div>
            </div>

            {/* Row 3: Lead Time & Reorder Buffer Days */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนวันที่ผลิต (Lead Time)</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  type="number"
                  placeholder="จำนวนวัน (default: 7)"
                  value={newProduct.leadTimeDays ?? 7}
                  onChange={(e) => setNewProduct({ ...newProduct, leadTimeDays: parseInt(e.target.value) || 0 })}
                  min="0"
                />
                <p className="text-xs text-gray-500 mt-1">จำนวนวันในการสั่งซื้อสินค้า</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันบัฟเฟอร์ (Reorder Buffer Days)</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  type="number"
                  placeholder="จำนวนวัน (default: 7)"
                  value={newProduct.reorderBufferDays ?? 7}
                  onChange={(e) => setNewProduct({ ...newProduct, reorderBufferDays: parseInt(e.target.value) || 0 })}
                  min="0"
                />
                <p className="text-xs text-gray-500 mt-1">วันที่คัดแยกเพื่อความปลอดภัยในการสั่งซื้อ</p>
              </div>
            </div>
          </div>

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
            {!editMode && (
              <button
                type="button"
                onClick={() => setIsFormExpanded(false)}
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
      )}

      {/* Products List */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">📋 รายการสินค้า</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">Brand</th>
                <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">Category</th>
                <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">Name</th>
                <th className="text-center py-2 px-3 text-sm font-semibold text-gray-600">Status</th>
                <th className="text-center py-2 px-3 text-sm font-semibold text-gray-600">Variants</th>
                <th className="text-center py-2 px-3 text-sm font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <>
                  <tr key={p._id} className={`border-b border-gray-100 hover:bg-gray-50 ${p.status === 'archived' ? 'opacity-60' : ''}`}>
                    <td className="py-2 px-3 text-sm text-gray-600">{getBrandName(p.brand)}</td>
                    <td className="py-2 px-3 text-sm text-gray-600">{getCategoryName(p.category)}</td>
                    <td className="py-2 px-3 text-sm font-medium">{p.name}</td>
                    <td className="py-2 px-3 text-sm text-center">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        p.status === 'active' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {p.status === 'active' ? '✅ ใช้งาน' : '📦 หยุดใช้'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sm text-center">{p.variants?.length || 0}</td>
                    <td className="py-2 px-3 text-center space-x-2">
                      <button
                        onClick={() => setExpandedProductId(expandedProductId === p._id ? null : p._id)}
                        className={`px-3 py-1 text-white text-sm rounded transition-colors ${
                          expandedProductId === p._id
                            ? 'bg-orange-600 hover:bg-orange-700'
                            : 'bg-gray-600 hover:bg-gray-700'
                        }`}
                      >
                        {expandedProductId === p._id ? '▼ ยุบ' : '▶ ดูรายละเอียด'}
                      </button>
                      <button
                        onClick={() => handleEdit(p)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                      >
                        แก้ไข
                      </button>
                    </td>
                  </tr>
                  
                  {/* Expandable Details Row */}
                  {expandedProductId === p._id && (
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <td colSpan={6} className="py-4 px-3">
                        <div className="space-y-3">
                          {/* Variants Section */}
                          <div>
                            <h4 className="font-semibold text-gray-700 mb-2">📦 รายละเอียด Variants</h4>
                            <div className="bg-white border border-gray-200 rounded overflow-hidden">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-100 border-b border-gray-200">
                                    <th className="text-left px-3 py-2 font-semibold text-gray-700">SKU</th>
                                    <th className="text-left px-3 py-2 font-semibold text-gray-700">Variant</th>
                                    <th className="text-right px-3 py-2 font-semibold text-gray-700">ราคา</th>
                                    <th className="text-right px-3 py-2 font-semibold text-gray-700">คงคลัง</th>
                                    <th className="text-center px-3 py-2 font-semibold text-gray-700">Reorder</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.variants?.map((v, idx) => (
                                    <tr key={v._id || idx} className={`border-b border-gray-100 ${v.stockOnHand <= 0 ? 'bg-red-50' : ''}`}>
                                      <td className="px-3 py-2">
                                        <span className="font-mono text-blue-700 font-semibold">{v.sku}</span>
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="text-xs text-gray-600">
                                          {v.model && <span>{v.model}</span>}
                                          {v.attributes?.color && <span> | {v.attributes.color}</span>}
                                          {v.attributes?.size && <span> | {v.attributes.size}</span>}
                                          {v.attributes?.material && <span> | {v.attributes.material}</span>}
                                        </div>
                                        {v.batches && Array.isArray(v.batches) && v.batches.length > 0 && (
                                          <div className="text-xs text-blue-600 mt-1">
                                            📦 {v.batches.length} batch{v.batches.length > 1 ? 'es' : ''}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right">{v.price} ฿</td>
                                      <td className={`px-3 py-2 text-right ${v.stockOnHand <= 0 ? 'text-red-600 font-semibold' : ''}`}>
                                        {v.stockOnHand ?? 0}
                                      </td>
                                      <td className="px-3 py-2 text-center text-xs text-gray-600">
                                        {v.reorderPoint ?? '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Product Settings Section */}
                          {(p.reorderBufferDays || p.minOrderQty || p.leadTimeDays || !p.enableStockAlerts || p.costingMethod) && (
                            <div>
                              <h4 className="font-semibold text-gray-700 mb-2">⚙️ การตั้งค่า</h4>
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 bg-white p-3 rounded border border-gray-200 text-sm">
                                {p.leadTimeDays && (
                                  <div>
                                    <span className="font-medium text-gray-600">Lead Time:</span>
                                    <div className="text-blue-700">{p.leadTimeDays} วัน</div>
                                  </div>
                                )}
                                {p.reorderBufferDays && (
                                  <div>
                                    <span className="font-medium text-gray-600">Buffer Days:</span>
                                    <div className="text-blue-700">{p.reorderBufferDays} วัน</div>
                                  </div>
                                )}
                                {p.minOrderQty && (
                                  <div>
                                    <span className="font-medium text-gray-600">MOQ:</span>
                                    <div className="text-blue-700">{p.minOrderQty} ชิ้น</div>
                                  </div>
                                )}
                                {p.costingMethod && (
                                  <div>
                                    <span className="font-medium text-gray-600">Costing:</span>
                                    <div className="text-blue-700">{p.costingMethod}</div>
                                  </div>
                                )}
                                {p.enableStockAlerts === false && (
                                  <div>
                                    <span className="font-medium text-orange-600">🔇 ปิดแจ้งเตือน</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
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
