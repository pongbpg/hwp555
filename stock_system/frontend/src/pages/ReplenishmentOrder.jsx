import { useEffect, useState } from 'react';
import api from '../api.js';

export default function ReplenishmentOrder() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedProducts, setExpandedProducts] = useState(new Set());

  const fmtNumber = new Intl.NumberFormat('th-TH');

  // ฟังก์ชันคำนวณ allocation ใหม่เมื่อปรับ totalOrder
  const recalculateAllocation = (product, newTotalOrder) => {
    if (newTotalOrder <= 0) return product.variants;

    // Largest Remainder Method
    const allocations = product.variants.map((v) => {
      const percentage = product.totalRecommended > 0
        ? (v.recommendedOrderQty || 0) / product.totalRecommended
        : 0;
      const baseAllocation = Math.floor(newTotalOrder * percentage);
      const remainder = newTotalOrder * percentage - baseAllocation;
      return { variant: v, baseAllocation, remainder };
    });

    const sorted = allocations.sort((a, b) => b.remainder - a.remainder);
    const remainderUnits = newTotalOrder - allocations.reduce((sum, a) => sum + a.baseAllocation, 0);
    
    for (let i = 0; i < remainderUnits && i < sorted.length; i++) {
      sorted[i].baseAllocation += 1;
    }

    return sorted.map(a => ({
      ...a.variant,
      _allocatedQty: a.baseAllocation
    }));
  };

  // ฟังก์ชันปรับ totalOrder
  const handleTotalOrderChange = (productId, newValue) => {
    setOrders((prev) =>
      prev.map((product) => {
        if (product.productId !== productId) return product;
        
        const newTotalOrder = Math.max(0, Number(newValue) || 0);
        return {
          ...product,
          totalOrder: newTotalOrder,
          variants: recalculateAllocation(product, newTotalOrder),
        };
      })
    );
  };

  const loadReplenishmentData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/insights?days=30&top=50');
      
      // Group reorder suggestions by product
      const productMap = new Map();
      (res.data.reorderSuggestions || []).forEach((item) => {
        const key = String(item.productId);
        if (!productMap.has(key)) {
          productMap.set(key, {
            productId: item.productId,
            productName: item.productName,
            minOrderQty: item.minOrderQty,
            variants: [],
            totalRecommended: 0,
            totalCurrentStock: 0,
            totalNetOrder: 0,
            totalOrder: 0,
          });
        }
        const product = productMap.get(key);
        product.variants.push(item);
        product.totalRecommended += item.recommendedOrderQty || 0;
        product.totalCurrentStock += item.currentStock || 0;
        // คำนวณจำนวนที่ต้องสั่งจริง (แนะนำ - คงเหลือ)
        const netOrder = Math.max(0, (item.recommendedOrderQty || 0) - (item.currentStock || 0));
        product.totalNetOrder += netOrder;
      });

      // Allocate MOQ using Largest Remainder Method for accuracy
      const groupedOrders = Array.from(productMap.values()).map((product) => {
        // ใช้ totalNetOrder (จำนวนที่ต้องสั่งเพิ่ม) เป็นพื้นฐาน
        const baseOrderQty = Math.max(product.totalNetOrder, product.minOrderQty > 0 ? product.minOrderQty : 0);
        
        if (product.minOrderQty > 0 && product.minOrderQty > product.totalNetOrder) {
          // ต้องเพิ่มเพื่อให้ครบ MOQ
          const allocations = product.variants.map((v) => {
            // ใช้ recommendedOrderQty แต่คำนวณสัดส่วนเทียบกับยอดขาย ไม่ใช่สต็อก
            const netOrder = Math.max(0, (v.recommendedOrderQty || 0) - (v.currentStock || 0));
            const percentage = product.totalRecommended > 0
              ? (v.recommendedOrderQty || 0) / product.totalRecommended
              : 0;
            const baseAllocation = Math.floor(product.minOrderQty * percentage);
            const remainder = product.minOrderQty * percentage - baseAllocation;
            return { variant: v, netOrder, baseAllocation, remainder };
          });

          const sorted = allocations.sort((a, b) => b.remainder - a.remainder);
          const remainderUnits = product.minOrderQty - allocations.reduce((sum, a) => sum + a.baseAllocation, 0);
          
          for (let i = 0; i < remainderUnits && i < sorted.length; i++) {
            sorted[i].baseAllocation += 1;
          }

          product.variants = sorted.map(a => ({
            ...a.variant,
            _allocatedQty: a.baseAllocation,
            _netOrder: a.netOrder
          }));
          product.totalOrder = product.minOrderQty;
        } else {
          // ไม่ต้องเพิ่มเพื่อ MOQ ใช้ totalNetOrder เลย
          product.variants = product.variants.map(v => {
            const netOrder = Math.max(0, (v.recommendedOrderQty || 0) - (v.currentStock || 0));
            return {
              ...v,
              _allocatedQty: Math.max(0, (v.recommendedOrderQty || 0) - (v.currentStock || 0)),
              _netOrder: netOrder
            };
          });
          product.totalOrder = product.totalNetOrder;
        }
        
        return product;
      });

      setOrders(groupedOrders);
    } catch (err) {
      setError(err.response?.data?.error || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReplenishmentData();
  }, []);

  const toggleExpand = (productId) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
    } else {
      newExpanded.add(productId);
    }
    setExpandedProducts(newExpanded);
  };

  if (loading) {
    return <div className="p-6 text-center">กำลังโหลด...</div>;
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-lg">
        ⚠️ {error}
        <button onClick={loadReplenishmentData} className="ml-4 bg-red-600 text-white px-3 py-1 rounded text-sm">
          ลองใหม่
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📦 แผนการเติมสต็อก (Replenishment Order)</h1>
          <p className="text-gray-500 text-sm">สรุปการสั่งซื้อตามสินค้า พร้อมการแบ่งให้แต่ละ Variant</p>
        </div>
        <button
          onClick={loadReplenishmentData}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          🔄 รีเฟรช
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-lg font-semibold text-green-700">สต็อกอยู่ในระดับดี</p>
          <p className="text-gray-500">ไม่มีสินค้าที่ต้องเติมสต็อก</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((product) => {
            const isExpanded = expandedProducts.has(product.productId);
            const hasMultiVariants = product.variants.length > 1;
            const moqAlert = product.minOrderQty > 0 && product.minOrderQty !== product.totalRecommended;

            return (
              <div key={product.productId} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                {/* Product Summary Row */}
                <button
                  onClick={() => toggleExpand(product.productId)}
                  className="w-full bg-white hover:bg-gray-50 p-4 flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 text-left">
                    <div className="text-xl text-gray-400">
                      {isExpanded ? '▼' : '▶'}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-800">{product.productName}</h3>
                      <p className="text-sm text-gray-500">
                        {hasMultiVariants ? `${product.variants.length} Variant` : '1 Variant'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    {/* สต็อกคงเหลือ */}
                    <div className="text-right">
                      <p className="text-xs text-gray-500">สต็อกคงเหลือ</p>
                      <p className="text-lg font-medium text-gray-700">
                        {fmtNumber.format(product.totalCurrentStock)} ชิ้น
                      </p>
                    </div>

                    {/* ยอดแนะนำ */}
                    <div className="text-right">
                      <p className="text-xs text-gray-500">แนะนำทั้งหมด</p>
                      <p className="text-lg font-medium text-blue-600">
                        {fmtNumber.format(product.totalRecommended)} ชิ้น
                      </p>
                    </div>

                    {/* ยอดสั่ง - สามารถแก้ไขได้ */}
                    <div className="text-right min-w-[220px]">
                      <div className="flex items-center gap-2 justify-end mb-1">
                        <p className="text-xs text-gray-500">ต้องสั่งเพิ่ม</p>
                        {product.minOrderQty > 0 && product.minOrderQty > product.totalNetOrder && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium">
                            📦 MOQ {fmtNumber.format(product.minOrderQty)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <input
                          type="number"
                          value={product.totalOrder}
                          onChange={(e) => handleTotalOrderChange(product.productId, e.target.value)}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-lg font-bold text-green-600 focus:ring-2 focus:ring-blue-500 outline-none"
                          min="0"
                        />
                        <span className="text-gray-600 text-sm">ชิ้น</span>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Variant Details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-600 uppercase mb-3">
                        📋 แบ่งการสั่งตามแต่ละ Variant
                      </p>
                      <div className="space-y-2">
                        {product.variants.map((variant, idx) => {
                          const percentageOfTotal = product.totalOrder > 0
                            ? ((variant.recommendedOrderQty || 0) / product.totalRecommended) * 100
                            : 0;
                          const allocatedQty = variant._allocatedQty || (variant.recommendedOrderQty || 0);
                          const moqAdjustment = allocatedQty - (variant._netOrder || 0);
                          const currentStock = variant.currentStock || 0;

                          return (
                            <div key={idx} className="bg-white rounded p-3 border border-gray-200">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <p className="font-medium text-gray-800">{variant.sku}</p>
                                  <p className="text-xs text-gray-500">
                                    ขายเฉลี่ย {variant.dailySalesRate} ชิ้น/วัน
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-gray-600 mb-1">
                                    คงเหลือ: <span className="font-semibold text-gray-800">{fmtNumber.format(currentStock)}</span> | 
                                    แนะนำ: <span className="font-bold text-blue-600">{fmtNumber.format(variant.recommendedOrderQty || 0)}</span>
                                  </p>
                                  <p className="text-sm text-gray-700">สั่งเพิ่ม: <span className="font-bold text-green-600">{fmtNumber.format(allocatedQty)}</span> ชิ้น</p>
                                </div>
                              </div>

                              {/* Progress Bar */}
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                                  style={{
                                    width: `${percentageOfTotal}%`,
                                  }}
                                ></div>
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <p className="text-sm text-gray-600">
                                  {percentageOfTotal.toFixed(1)}% ของการสั่งทั้งหมด
                                </p>
                                {moqAdjustment > 0 && (
                                  <p className="text-sm text-amber-600 font-semibold">
                                    +{fmtNumber.format(moqAdjustment)} (MOQ)
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {product.minOrderQty > 0 && product.minOrderQty > product.totalNetOrder && (
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded">
                          <p className="text-xs text-amber-700">
                            <strong>💡 MOQ Adjustment:</strong> เพิ่ม{' '}
                            <strong>{fmtNumber.format(product.minOrderQty - product.totalNetOrder)}</strong> ชิ้นเพื่อให้ครบขั้นต่ำการสั่ง ({fmtNumber.format(product.minOrderQty)} ชิ้น)
                            โดยแบ่งตามสัดส่วนยอดขายของแต่ละ Variant
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Statistics */}
      {orders.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow p-4 text-white">
            <p className="text-sm opacity-90">📦 สินค้าที่ต้องเติม</p>
            <p className="text-3xl font-bold mt-2">{orders.length}</p>
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow p-4 text-white">
            <p className="text-sm opacity-90">✅ รวมต้องสั่ง</p>
            <p className="text-3xl font-bold mt-2">
              {fmtNumber.format(orders.reduce((sum, p) => sum + p.totalOrder, 0))}
            </p>
          </div>
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow p-4 text-white">
            <p className="text-sm opacity-90">📌 MOQ Adjustments</p>
            <p className="text-3xl font-bold mt-2">
              {fmtNumber.format(
                orders
                  .filter(p => p.minOrderQty > 0)
                  .reduce((sum, p) => sum + Math.max(0, p.minOrderQty - p.totalRecommended), 0)
              )}
            </p>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow p-4 text-white">
            <p className="text-sm opacity-90">💡 Variant ทั้งหมด</p>
            <p className="text-3xl font-bold mt-2">
              {orders.reduce((sum, p) => sum + p.variants.length, 0)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
