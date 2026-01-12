import React, { useEffect, useState } from 'react';
import api from '../api.js';
import SearchableSelect from '../components/SearchableSelect.jsx';
import { parseFile, validateCSVRows, downloadTemplate } from '../utils/csvUtils.js';

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
// ✅ ดึง max number จาก reference string แทนการนับ length (เพราะ orders มี pagination)
const generateReference = (type, orderDate, orders) => {
  const prefixes = {
    sale: 'SO',
    purchase: 'PO',
    adjustment: 'ADJ',
  };
  const prefix = prefixes[type] || type.toUpperCase();
  const thaiYear = getThaiYear(orderDate);
  const expectedPrefix = `${prefix}${thaiYear}-`; // เช่น "SO2569-"

  // หาตัวเลขสูงสุดจากทั้งหมดที่มีอยู่ (ไม่ว่าจะในหน้าไหน)
  let maxNumber = 0;
  (orders || []).forEach((o) => {
    if (o.reference && o.reference.startsWith(expectedPrefix)) {
      const numStr = o.reference.substring(expectedPrefix.length);
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
  });

  const nextNumber = maxNumber + 1;
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
  const [referenceError, setReferenceError] = useState(''); // เก็บข้อผิดพลาด reference ซ้ำ

  // CSV Import states
  const [showImportTab, setShowImportTab] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvErrors, setCsvErrors] = useState([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [selectedProductsForTemplate, setSelectedProductsForTemplate] = useState([]);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [showProductSearchResults, setShowProductSearchResults] = useState(false);
  const [csvGeneratedReference, setCsvGeneratedReference] = useState(''); // ✅ เลข reference สำหรับ CSV import

  const loadProducts = async () => {
    try {
      const res = await api.get('/products');
      setProducts(res.data || []);
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load products');
      return false;
    }
  };

  // ✅ ดึง orders ทั้งหมด (ไม่ pagination) สำหรับ generate reference
  const loadAllOrdersForRef = async () => {
    try {
      const res = await api.get('/inventory/orders?limit=10000');
      return res.data?.items || [];
    } catch (err) {
      console.error('Failed to load orders for reference:', err);
      return [];
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
      
      // Server already sorts: pending purchase orders first, then by date
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
    // ✅ Reset reference เมื่อ type ฟอร์มเปลี่ยน (เก็บ filter ของตารางแยกต่างหาก)
    if (type) {
      setReference(''); // ✅ Reset reference เพื่อให้ generate ใหม่ตามประเภท
    }
  }, [type]);

  useEffect(() => {
    // ✅ Generate reference ด้วย orders ทั้งหมด (ไม่ pagination)
    const generateRef = async () => {
      if (!reference.trim()) {
        const allOrders = await loadAllOrdersForRef();
        const suggestedRef = generateReference(type, orderDate, allOrders);
        setReference(suggestedRef);
        setReferenceError('');
      }
    };
    generateRef();
  }, [type, orderDate, reference]);

  useEffect(() => {
    // ✅ Generate reference สำหรับ CSV import เมื่อ type, orderDate, หรือ reference เปลี่ยน
    const generateCsvRef = async () => {
      const allOrders = await loadAllOrdersForRef();
      const csvRef = generateReference(type, orderDate, allOrders);
      setCsvGeneratedReference(csvRef);
    };
    generateCsvRef();
  }, [type, orderDate, reference]);

  // ตรวจสอบว่า reference ซ้ำหรือไม่เมื่อผู้ใช้เปลี่ยนค่า
  const checkReferenceExists = (ref) => {
    if (!ref.trim()) {
      setReferenceError('');
      return false;
    }
    const exists = orders.some((o) => o.reference === ref.trim());
    if (exists) {
      setReferenceError(`⚠️ เลขอ้างอิง "${ref}" มีอยู่แล้ว กรุณาใช้เลขอ้างอิงอื่น`);
    } else {
      setReferenceError('');
    }
    return exists;
  };

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
    
    // Check if any items have decreased received quantity (not allowed)
    const edits = receiveEdits[order._id] || [];
    const decreasedItems = [];
    
    (order.items || []).forEach((it, idx) => {
      const newReceived = Number(edits[idx] ?? it.receivedQuantity ?? 0) || 0;
      const oldReceived = Number(it.receivedQuantity ?? 0) || 0;
      if (newReceived < oldReceived) {
        decreasedItems.push({
          productName: it.productName,
          sku: it.sku,
          ordered: it.quantity,
          oldQuantity: oldReceived,
          newQuantity: newReceived,
          difference: oldReceived - newReceived,
        });
      }
    });
    
    // ❌ Prevent if any items have decreased quantity
    if (decreasedItems.length > 0) {
      let errorMsg = '❌ ไม่ได้ เพราะเคยบันทึกยอดรับแล้ว\n\nไม่สามารถลดจำนวนที่บันทึกไปแล้ว:\n';
      decreasedItems.forEach((item) => {
        errorMsg += `\n  • ${item.productName} (${item.sku})\n    สั่งซื้อ: ${item.ordered} ชิ้น\n    เคยรับ: ${item.oldQuantity} ชิ้น\n    ⚠️ พยายามปรับเป็น: ${item.newQuantity} ชิ้น (ลด ${item.difference} ชิ้น)\n`;
      });
      errorMsg += '\n💡 วิธีแก้: ลดจำนวนรับได้เฉพาะบนใบสั่งซื้อเท่านั้น หรือติดต่อผู้จัดการ';
      window.alert(errorMsg);
      return;
    }
    
    // ✅ Show confirmation dialog for normal save
    const editsDetails = (order.items || [])
      .map((it, idx) => {
        const newReceived = Number(edits[idx] ?? it.receivedQuantity ?? 0) || 0;
        const oldReceived = Number(it.receivedQuantity ?? 0) || 0;
        if (newReceived > oldReceived) {
          return `  • ${it.productName} (${it.sku}): +${newReceived - oldReceived} ชิ้น`;
        }
        return null;
      })
      .filter(Boolean);
    
    let confirmMsg = 'ยืนยันการบันทึกรับของ?\n\n';
    if (editsDetails.length > 0) {
      confirmMsg += '📦 การเปลี่ยนแปลง:\n' + editsDetails.join('\n') + '\n\n';
    }
    
    if (!window.confirm(confirmMsg + 'ดำเนินการต่อหรือไม่?')) return;
    
    setReceiving(true);
    setError('');
    setMessage('');
    try {
      const payloadItems = (order.items || []).map((it, idx) => ({
        variantId: it.variantId,
        receivedQuantity: Number(edits[idx] ?? it.receivedQuantity ?? 0) || 0,
      }));
      await api.patch(`/inventory/orders/${order._id}/receive`, { items: payloadItems });
      setMessage('บันทึกรับของแล้ว');
      // โหลดข้อมูลใหม่ - รอให้ทั้งสองเสร็จ
      await Promise.all([loadOrders(page), loadProducts()]);
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
      // โหลดข้อมูลใหม่ - รอให้ทั้งสองเสร็จ
      await Promise.all([loadOrders(page), loadProducts()]);
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
      await loadOrders(page);
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
    
    // Confirm before submitting
    const itemCount = items.length;
    const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const confirmMsg = `ยืนยันการบันทึก?\n\n📦 จำนวนรายการ: ${itemCount}\n📊 จำนวนสินค้า: ${totalQty} หน่วย\n⚠️ โปรดตรวจสอบข้อมูลให้ถูกต้องก่อน`;
    
    if (!window.confirm(confirmMsg)) return;
    
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        type,
        reference,
        orderDate,
        items: items.map((it) => {
          const product = products.find((p) => p._id === it.productId);
          const variant = product?.variants?.find((v) => v._id === it.variantId);
          
          const item = {
            productId: it.productId,
            variantId: it.variantId,
            quantity: Number(it.quantity) || 0,
          };
          
          // ✅ Sale order: Backend จะคิด unitCost จาก batch อัตโนมัติ
          // ผู้ใช้ส่งแค่ unitPrice (ราคาขาย)
          if (type === 'sale') {
            item.unitPrice = Number(it.unitPrice) || 0;
          } else {
            // ✅ Purchase/Adjustment: ส่งแค่ unitPrice (ต้นทุน/มูลค่า)
            item.unitPrice = Number(it.unitPrice) || 0;
          }
          
          if (it.batchRef) item.batchRef = it.batchRef;
          if (it.expiryDate) item.expiryDate = it.expiryDate;
          return item;
        }),
      };
      await api.post('/inventory/orders', payload);
      setMessage('Order recorded');
      // Reset form
      setItems([{ ...defaultItem }]);
      setReference('');
      setReferenceError('');
      setType('sale');
      setOrderDate(new Date().toISOString().split('T')[0]);
      setPage(1);
      // โหลดข้อมูลใหม่ - รอให้ทั้งสอง request เสร็จก่อนเคลียร์ message
      await Promise.all([loadOrders(1), loadProducts()]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record');
    } finally {
      setSubmitting(false);
    }
  };

  // CSV Import Handlers
  const handleCSVFileSelect = (file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      setError('❌ ต้องเป็นไฟล์ CSV');
      return;
    }
    setCsvFile(file);
    parseCSVFile(file);
  };

  const parseCSVFile = async (file) => {
    try {
      setCsvErrors([]);
      setCsvPreview([]);
      
      // ใช้ parseFile() ที่รองรับทั้ง CSV และ XLSX
      const rows = await parseFile(file);

      // Validate rows
      const validation = validateCSVRows(rows, products, type);

      if (!validation.valid) {
        setCsvErrors(validation.errors);
        setCsvPreview([]);
      } else {
        setCsvPreview(validation.data);
        setCsvErrors([]);
      }
    } catch (err) {
      setCsvErrors([`❌ Parse error: ${err.message}`]);
      setCsvPreview([]);
    }
  };

  const submitCSVImport = async () => {
    if (csvPreview.length === 0) {
      setError('❌ ไม่มีข้อมูลที่ validate ได้');
      return;
    }

    setCsvImporting(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        type,
        reference: generateReference(type, orderDate, orders),
        orderDate,
        items: csvPreview.map((row) => {
          const item = {
            productId: row.productId,
            variantId: row.variantId,
            quantity: row.quantity,
          };
          
          // ✅ Sale order: เก็บทั้ง unitPrice + unitCost
          if (type === 'sale') {
            item.unitPrice = row.unitPrice;
            item.unitCost = row.cost || row.unitCost || 0;
          } else {
            // ✅ Purchase/Adjustment: เก็บแค่ unitCost
            item.unitCost = row.unitPrice || row.cost || row.unitCost || 0;
          }
          
          if (row.batchRef) item.batchRef = row.batchRef;
          if (row.expiryDate) item.expiryDate = row.expiryDate;
          return item;
        }),
      };

      await api.post('/inventory/orders', payload);
      setMessage(`✅ Import สำเร็จ! บันทึก ${csvPreview.length} รายการ`);

      // Reset CSV import
      setCsvFile(null);
      setCsvPreview([]);
      setCsvErrors([]);
      setShowImportTab(false);
      setPage(1);

      // Reload data
      await Promise.all([loadOrders(1), loadProducts()]);
    } catch (err) {
      setError(`❌ ${err.response?.data?.error || 'Failed to import'}`);
    } finally {
      setCsvImporting(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleCSVFileSelect(files[0]);
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

      {/* Tabs: Manual Entry vs Import CSV */}
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex gap-3 border-b border-gray-200 mb-4">
          <button
            type="button"
            className={`px-6 py-3 font-medium border-b-2 transition ${!showImportTab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            onClick={() => setShowImportTab(false)}
          >
            ✏️ ป้อนข้อมูลด้วยตนเอง
          </button>
          <button
            type="button"
            className={`px-6 py-3 font-medium border-b-2 transition ${showImportTab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            onClick={() => setShowImportTab(true)}
          >
            📤 Import จาก CSV
          </button>
        </div>

        {/* Manual Entry Tab */}
        {!showImportTab && (
          <>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ประเภท
                    <span className="ml-2 text-xs text-gray-500" title="เลือกประเภทการทำรายการ">
                      ℹ️
                    </span>
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                  >
                    <option value="sale">Sale (ขาย) - บันทึกการขายสินค้า</option>
                    <option value="purchase">Purchase (ซื้อ) - บันทึกการสั่งซื้อสินค้า</option>
                    <option value="adjustment">Adjustment (ปรับปรุง) - ปรับปรุงสต็อก</option>
                  </select>
                  {type === 'sale' && (
                    <p className="text-xs text-blue-600 mt-1">💰 ใช้ราคาขายที่จะขายให้ลูกค้า</p>
                  )}
                  {type === 'purchase' && (
                    <p className="text-xs text-orange-600 mt-1">💵 ใช้ราคาต้นทุนที่ซื้อมา</p>
                  )}
                  {type === 'adjustment' && (
                    <p className="text-xs text-purple-600 mt-1">✅ เหมาะกับนับสต็อก (หลาย SKU พร้อมกัน) | สำหรับ 1 SKU ใช้หน้า Movements</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เลขอ้างอิง (Reference) <span className="text-red-500">*</span></label>
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 font-mono font-semibold cursor-not-allowed opacity-75">
                    {reference || '-'}
                  </div>
                  <p className="text-xs text-gray-600 mt-1">🔒 อัตโนมัติ (ห้ามแก้ไข)</p>
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

                  // Filter out archived products for selection
                  const activeProducts = products.filter((p) => p.status !== 'archived');

                  return (
                    <div key={idx} className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
                      <div className="text-xs text-gray-500 mb-2">รายการที่ {idx + 1}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">สินค้า</label>
                          <SearchableSelect
                            options={activeProducts}
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
                          <label className="block text-xs text-gray-500 mb-1">
                            {type === 'adjustment' ? '📊 สต็อกใหม่ (ยอดที่นับได้)' : 'จำนวน'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                            placeholder={type === 'adjustment' ? 'ใส่ยอดสต็อกที่นับได้' : 'จำนวน'}
                          />
                          {type === 'adjustment' && item.variantId && (() => {
                            const product = products.find((p) => p._id === item.productId);
                            const variant = product?.variants?.find((v) => v._id === item.variantId);
                            const currentStock = variant?.stockOnHand || 0;
                            const targetStock = Number(item.quantity) || 0;
                            const delta = targetStock - currentStock;
                            return (
                              <p className="text-xs mt-1">
                                <span className="text-gray-600">ปัจจุบัน: {currentStock} ชิ้น</span>
                                {delta !== 0 && (
                                  <span className={delta > 0 ? 'text-green-600 ml-2' : 'text-red-600 ml-2'}>
                                    → {delta > 0 ? `+${delta}` : delta} ชิ้น
                                  </span>
                                )}
                              </p>
                            );
                          })()}
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            {type === 'sale' ? '💰 ราคาขาย/หน่วย' : '💵 ต้นทุน/หน่วย'}
                            <span 
                              className="ml-1 text-gray-400 cursor-help" 
                              title={
                                type === 'sale' 
                                  ? 'ราคาที่ขายให้ลูกค้า' 
                                  : type === 'purchase' 
                                    ? 'ราคาต้นทุนที่ซื้อมา (จะบันทึกใน batch.cost)' 
                                    : 'ราคาต้นทุนสำหรับบันทึก batch'
                              }
                            >
                              ℹ️
                            </span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(idx, { unitPrice: e.target.value })}
                            placeholder={type === 'sale' ? 'ราคาขาย' : 'ราคาต้นทุน'}
                          />
                          {type === 'sale' && (
                            <p className="text-xs text-blue-500 mt-0.5">ราคาที่ขายให้ลูกค้า</p>
                          )}
                          {(type === 'purchase' || type === 'adjustment') && (
                            <p className="text-xs text-orange-500 mt-0.5">ราคาต้นทุน (cost)</p>
                          )}
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

              <div className="flex gap-3 justify-between">
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
          </>
        )}
        {/* CSV Import Tab */}
        {showImportTab && (
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">📤 Import Orders จาก CSV</h2>

            {/* Step 1: Select CSV Type and Download Template */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ประเภท Order</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value);
                      setCsvFile(null);
                      setCsvPreview([]);
                      setCsvErrors([]);
                    }}
                  >
                    <option value="sale">Sale (ขาย)</option>
                    <option value="purchase">Purchase (ซื้อ)</option>
                    <option value="adjustment">Adjustment (ปรับปรุง)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">📊 เลข Reference</label>
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 font-mono font-semibold cursor-not-allowed opacity-75">
                    {csvGeneratedReference || '-'}
                  </div>
                  <p className="text-xs text-gray-600 mt-1">🔒 อัตโนมัติ (ห้ามแก้ไข)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">📥 Template</label>
                  <button
                    type="button"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition"
                    onClick={() => downloadTemplate(type, selectedProductsForTemplate.length > 0 ? selectedProductsForTemplate : null)}
                  >
                    ⬇️ ดาวโหลด Template CSV
                  </button>
                  <p className="text-xs text-gray-600 mt-2">
                    📝 {selectedProductsForTemplate.length > 0 ? `Template มี ${selectedProductsForTemplate.length} สินค้า` : 'เลือกสินค้าหรือดาวโหลด template ว่าง'}
                  </p>
                </div>
              </div>

              {/* Product Selector for Template - Search Based */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">🔍 ค้นหาและเลือกสินค้า (Optional)</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="พิมพ์ชื่อสินค้า..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={productSearchQuery}
                    onChange={(e) => {
                      setProductSearchQuery(e.target.value);
                      setShowProductSearchResults(e.target.value.length > 0);
                    }}
                    onFocus={() => productSearchQuery.length > 0 && setShowProductSearchResults(true)}
                  />
                  
                  {/* Search Results Dropdown */}
                  {showProductSearchResults && productSearchQuery.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-lg mt-1 max-h-64 overflow-y-auto shadow-lg z-10">
                      {products
                        .filter((prod) =>
                          prod.name.toLowerCase().includes(productSearchQuery.toLowerCase())
                        )
                        .length > 0 ? (
                        products
                          .filter((prod) =>
                            prod.name.toLowerCase().includes(productSearchQuery.toLowerCase())
                          )
                          .map((prod) => {
                            const isSelected = selectedProductsForTemplate.some((p) => p._id === prod._id);
                            const activeVariantCount = prod.variants?.filter((v) => v.status === 'active').length || 0;
                            return (
                              <label
                                key={prod._id}
                                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0"
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedProductsForTemplate((prev) => [...prev, prod]);
                                    } else {
                                      setSelectedProductsForTemplate((prev) =>
                                        prev.filter((p) => p._id !== prod._id)
                                      );
                                    }
                                  }}
                                  className="w-4 h-4 cursor-pointer"
                                />
                                <div className="flex-1">
                                  <div className="text-sm text-gray-800 font-medium">{prod.name}</div>
                                  <div className="text-xs text-gray-500">
                                    {activeVariantCount} variant {activeVariantCount > 0 ? '✓' : ''}
                                  </div>
                                </div>
                              </label>
                            );
                          })
                      ) : (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">ไม่พบสินค้า</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Products - Show as Chips */}
              {selectedProductsForTemplate.length > 0 && (
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ✅ สินค้าที่เลือก ({selectedProductsForTemplate.length})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedProductsForTemplate.map((prod) => {
                      const activeVariantCount = prod.variants?.filter((v) => v.status === 'active').length || 0;
                      return (
                        <div
                          key={prod._id}
                          className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center gap-2"
                        >
                          <span>{prod.name}</span>
                          <span className="text-xs bg-blue-200 px-2 py-0.5 rounded-full">{activeVariantCount}v</span>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedProductsForTemplate((prev) => prev.filter((p) => p._id !== prod._id))
                            }
                            className="text-blue-600 hover:text-blue-800 font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
                    onClick={() => setSelectedProductsForTemplate([])}
                  >
                    🗑️ ล้างทั้งหมด
                  </button>
                </div>
              )}
            </div>

            {/* Step 2: Upload CSV/XLSX File */}
            <div
              className="mb-6 p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 transition bg-gray-50 cursor-pointer"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                id="csvFileInput"
                onChange={(e) => handleCSVFileSelect(e.target.files?.[0])}
              />
              <label htmlFor="csvFileInput" className="cursor-pointer">
                <div className="text-center">
                  <div className="text-3xl mb-2">📄</div>
                  <p className="text-gray-700 font-medium">ลาก CSV/XLSX ลงที่นี่ หรือ คลิกเพื่อเลือกไฟล์</p>
                  <p className="text-xs text-gray-500 mt-1">รองรับไฟล์ .csv และ .xlsx</p>
                </div>
              </label>
            </div>

            {csvFile && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                ✅ เลือกไฟล์: <strong>{csvFile.name}</strong>
              </div>
            )}

            {/* Step 3: Show Errors */}
            {csvErrors.length > 0 && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="font-medium text-red-700 mb-2">❌ ข้อผิดพลาด:</h3>
                <ul className="text-sm text-red-600 space-y-1">
                  {csvErrors.map((err, idx) => (
                    <li key={idx}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Step 4: Preview Data */}
            {csvPreview.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">👀 ตัวอย่างข้อมูล ({csvPreview.length} รายการ)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-300 bg-gray-100">
                        <th className="text-left py-2 px-3">สินค้า</th>
                        <th className="text-left py-2 px-3">SKU</th>
                        <th className="text-right py-2 px-3">จำนวน</th>
                        <th className="text-right py-2 px-3">ราคา/หน่วย</th>
                        {type === 'purchase' && (
                          <>
                            <th className="text-left py-2 px-3">Batch Ref</th>
                            <th className="text-left py-2 px-3">Expiry Date</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.map((row, idx) => (
                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-3">{row.productName}</td>
                          <td className="py-2 px-3 font-mono text-xs text-gray-600">{row.sku}</td>
                          <td className="py-2 px-3 text-right">{row.quantity}</td>
                          <td className="py-2 px-3 text-right">{row.unitPrice.toFixed(2)}</td>
                          {type === 'purchase' && (
                            <>
                              <td className="py-2 px-3 text-gray-600">{row.batchRef || '-'}</td>
                              <td className="py-2 px-3 text-gray-600">
                                {row.expiryDate ? new Date(row.expiryDate).toLocaleDateString('th-TH') : '-'}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary */}
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">รายการทั้งหมด</div>
                      <div className="text-2xl font-bold text-blue-600">{csvPreview.length}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">จำนวนทั้งหมด</div>
                      <div className="text-2xl font-bold text-blue-600">{csvPreview.reduce((sum, row) => sum + row.quantity, 0)}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">มูลค่าทั้งหมด</div>
                      <div className="text-2xl font-bold text-blue-600">
                        ฿{(csvPreview.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0)).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                onClick={() => {
                  setShowImportTab(false);
                  setCsvFile(null);
                  setCsvPreview([]);
                  setCsvErrors([]);
                }}
                disabled={csvImporting}
              >
                ❌ ยกเลิก
              </button>
              <button
                type="button"
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
                onClick={submitCSVImport}
                disabled={csvPreview.length === 0 || csvImporting}
              >
                {csvImporting ? '⏳ กำลังบันทึก...' : '✅ ยืนยันและบันทึก'}
              </button>
            </div>
          </div>
        )}
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
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">สินค้า</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-600">สถานะ</th>
                  <th className="text-center py-2 px-3 text-sm font-semibold text-gray-600">รายการ</th>
                  <th className="text-center py-2 px-3 text-sm font-semibold text-gray-600">จำนวนสินค้า</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-gray-600">ต้นทุนรวม</th>
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
                      <td className="py-2 px-3 text-sm max-w-xs">
                        <div className="text-gray-700 font-medium truncate">
                          {o.items && o.items.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {(() => {
                                // Group items by product name
                                const grouped = {};
                                (o.items || []).forEach((item) => {
                                  const name = item.productName || item.sku || 'N/A';
                                  grouped[name] = (grouped[name] || 0) + 1;
                                });
                                
                                return Object.entries(grouped).map(([name, count], idx) => (
                                  <div key={idx} className="truncate text-xs">
                                    {name}{count > 1 ? ` (×${count})` : ''}
                                  </div>
                                ));
                              })()}
                            </div>
                          ) : (
                            '-'
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(o.status)}`}>
                          {o.status || '-'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-sm text-center">{o.items?.length ?? 0}</td>
                      <td className="py-2 px-3 text-sm text-center">{(o.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)}</td>
                      <td className="py-2 px-3 text-sm text-right">
                        {o.type === 'sale' || o.type === 'adjustment' 
                          ? (o.items || []).reduce((sum, it) => sum + (Number(it.unitCost) || 0) * (Number(it.quantity) || 0), 0).toLocaleString()
                          : (o.items || []).reduce((sum, it) => sum + (Number(it.unitCost) || 0) * (Number(it.quantity) || 0), 0).toLocaleString()
                        }
                      </td>
                      <td className="py-2 px-3 text-sm text-right">
                        {o.type === 'purchase' || o.type === 'adjustment' ? '-' : calcOrderTotal(o).toLocaleString()}
                      </td>
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
                        <td colSpan={10}>
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 m-2">
                            <div className="grid grid-cols-3 gap-4 mb-4 text-sm text-gray-600 pb-3 border-b border-gray-300">
                              <div>
                                <strong className="text-gray-700">Reference:</strong> {o.reference || '-'}
                              </div>
                              <div>
                                <strong className="text-gray-700">Channel:</strong> {o.channel || '-'}
                              </div>
                              <div>
                                <strong className="text-gray-700">Notes:</strong> {o.notes || '-'}
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
                                  {o.type === 'purchase' && (
                                    <>
                                      <th className="text-right py-2 px-2 w-20">รับแล้ว</th>
                                      <th className="text-right py-2 px-2 w-20">ค้างรับ</th>
                                      <th className="text-right py-2 px-2 w-20">ต้นทุน/หน่วย</th>
                                      <th className="text-right py-2 px-2 w-24">ต้นทุนรวม</th>
                                    </>
                                  )}
                                  {o.type === 'sale' && (
                                    <>
                                      <th className="text-right py-2 px-2 w-20">ต้นทุน/หน่วย</th>
                                      <th className="text-right py-2 px-2 w-24">ต้นทุนรวม</th>
                                      <th className="text-right py-2 px-2 w-20">ราคาขาย/หน่วย</th>
                                      <th className="text-right py-2 px-2 w-24">ราคาขายรวม</th>
                                    </>
                                  )}
                                  {o.type === 'adjustment' && (
                                    <>
                                      <th className="text-right py-2 px-2 w-20">ต้นทุน/หน่วย</th>
                                      <th className="text-right py-2 px-2 w-24">ต้นทุนรวม</th>
                                    </>
                                  )}
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
                                    {o.type === 'purchase' && (
                                      <>
                                        <td className="py-2 px-2 text-right">
                                          {(() => {
                                            const received = receiveEdits[o._id]?.[idx] ?? it.receivedQuantity ?? 0;
                                            const isCompleteFromDB = it.receivedQuantity >= (it.quantity ?? 0);
                                            return isCompleteFromDB ? (
                                              <span className="font-semibold text-green-700">{it.receivedQuantity}</span>
                                            ) : (
                                              <input
                                                type="number"
                                                min="0"
                                                max={it.quantity ?? 0}
                                                className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-right"
                                                value={received}
                                                onChange={(e) => handleReceiveChange(o._id, idx, e.target.value)}
                                              />
                                            );
                                          })()}
                                        </td>
                                        <td className="py-2 px-2 text-right">
                                          {Math.max(0, (it.quantity ?? 0) - (receiveEdits[o._id]?.[idx] ?? it.receivedQuantity ?? 0))}
                                        </td>
                                        <td className="py-2 px-2 text-right">{(Number(it.unitCost) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td className="py-2 px-2 text-right text-orange-600 font-medium">
                                          {((Number(it.unitCost) || 0) * (Number(it.quantity) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                      </>
                                    )}
                                    {o.type === 'sale' && (
                                      <>
                                        <td className="py-2 px-2 text-right">{(Number(it.unitCost) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td className="py-2 px-2 text-right text-orange-600 font-medium">
                                          {((Number(it.unitCost) || 0) * (Number(it.quantity) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-2 px-2 text-right">{(Number(it.unitPrice) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td className="py-2 px-2 text-right text-green-600 font-medium">
                                          {((Number(it.unitPrice) || 0) * (Number(it.quantity) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                      </>
                                    )}
                                    {o.type === 'adjustment' && (
                                      <>
                                        <td className="py-2 px-2 text-right">{(Number(it.unitCost) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td className="py-2 px-2 text-right text-orange-600 font-medium">
                                          {((Number(it.unitCost) || 0) * (Number(it.quantity) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                      </>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {o.type === 'purchase' && (() => {
                              const allReceived = (o.items || []).every((it) => (it.receivedQuantity ?? 0) >= (it.quantity ?? 0));
                              return !allReceived && (
                                <div className="mt-3 flex justify-end gap-3">
                                  <button
                                    type="button"
                                    className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded-lg font-medium"
                                    onClick={() => {
                                      // Set all receive quantities to match remaining quantities
                                      const newEdits = {};
                                      newEdits[o._id] = (o.items || []).map((it) => it.quantity ?? 0);
                                      setReceiveEdits((prev) => ({ ...prev, ...newEdits }));
                                    }}
                                    disabled={receiving}
                                  >
                                    ✓ รับทั้งหมด
                                  </button>
                                  <button
                                    type="button"
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
                                    onClick={() => submitReceive(o)}
                                    disabled={receiving}
                                  >
                                    {receiving ? 'กำลังบันทึก...' : 'บันทึกรับของ'}
                                  </button>
                                </div>
                              );
                            })()}
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
                      className={`px-3 py-1 rounded text-sm ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'
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
    </div>
  );
}
