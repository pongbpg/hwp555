import { useEffect, useState } from 'react';
import api from '../api.js';

export default function ReplenishmentOrder() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedProducts, setExpandedProducts] = useState(new Set());
  const [showAddVariantModal, setShowAddVariantModal] = useState(null); // {productId, allVariants}
  const [productVariantsMap, setProductVariantsMap] = useState(new Map()); // เก็บ variants ทั้งหมดของแต่ละ product

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
    
    // ✅ แก้ไข: distribute remainder units แม้ว่ามี variants ไม่กี่ตัว
    for (let i = 0; i < remainderUnits; i++) {
      sorted[i % sorted.length].baseAllocation += 1;
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
      
      // ดึงข้อมูล products ทั้งหมด (เพื่อเก็บ variants ทั้งหมด)
      const productsRes = await api.get('/products?limit=1000');
      const allProducts = productsRes.data.items || [];
      
      // สร้าง map เก็บ variants ทั้งหมดของแต่ละ product
      const variantsMap = new Map();
      allProducts.forEach(product => {
        variantsMap.set(String(product._id), product.variants || []);
      });
      console.log('🔍 Debug: productVariantsMap loaded', {
        totalProducts: allProducts.length,
        variantsMap: Array.from(variantsMap.entries()).map(([pid, variants]) => ({
          productId: pid,
          variantCount: variants.length,
          skus: variants.map(v => v.sku)
        }))
      });
      setProductVariantsMap(variantsMap);
      
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

      // ✅ BUILD FAST MOVERS MAP
      const fastMoversByProduct = new Map();
      (res.data.fastMovers || []).forEach(item => {
        const key = String(item.productId);
        if (!fastMoversByProduct.has(key)) {
          fastMoversByProduct.set(key, []);
        }
        fastMoversByProduct.get(key).push(item);
      });

      // ✅ FOR PRODUCTS WITH MOQ DEFICIT: ADD FAST MOVERS TO FILL GAP
      for (const [productId, product] of productMap) {
        const minOrderQty = product.minOrderQty || 0;
        if (minOrderQty === 0) continue; // No MOQ constraint

        if (product.totalNetOrder >= minOrderQty) continue; // Already meets MOQ

        const deficit = minOrderQty - product.totalNetOrder;
        const productFastMovers = fastMoversByProduct.get(productId) || [];
        
        // Find fast movers not already in reorder list
        const existingSkus = new Set(product.variants.map(v => v.sku));
        const availableFastMovers = productFastMovers
          .filter(fm => !existingSkus.has(fm.sku))
          .sort((a, b) => b.quantitySold - a.quantitySold); // Sort by sales (highest first)

        console.log(`🔍 Adding Fast Movers for ${product.productName}:`, {
          minOrderQty,
          currentTotal: product.totalNetOrder,
          deficit,
          availableFastMovers: availableFastMovers.length,
          skus: availableFastMovers.slice(0, 5).map(fm => fm.sku)
        });

        // Add fast movers to fill deficit (proportional by sales rate)
        let remainingDeficit = deficit;
        const totalSalesRate = productFastMovers.reduce((sum, fm) => sum + (fm.dailySalesRate || 0), 0) || 1;

        for (const fastMover of availableFastMovers) {
          if (remainingDeficit <= 0) break;

          // Allocate proportional to daily sales rate
          const salesProportion = (fastMover.dailySalesRate || 0) / totalSalesRate;
          const allocation = Math.ceil(remainingDeficit * salesProportion);
          const finalAllocation = Math.min(allocation, remainingDeficit);

          product.variants.push({
            ...fastMover,
            recommendedOrderQty: finalAllocation,
            currentStock: fastMover.currentStock || 0,
            dailySalesRate: fastMover.dailySalesRate || 0,
            _isFastMoverAddedForMOQ: true, // Flag ให้ UI ระบุว่านี่ถูก add เพื่อครบ MOQ
          });

          product.totalRecommended += finalAllocation;
          product.totalNetOrder += finalAllocation;
          remainingDeficit -= finalAllocation;

          console.log(`  ✅ Added ${fastMover.sku}: ${finalAllocation} units to meet MOQ`);
        }
      }

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
          
          // ✅ แก้ไข: distribute remainder units แม้ว่ามี variants ไม่กี่ตัว
          for (let i = 0; i < remainderUnits; i++) {
            sorted[i % sorted.length].baseAllocation += 1;
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

  // ฟังก์ชันเพิ่ม variant เพิ่มเติม
  const addVariantToOrder = (productId, newVariant) => {
    setOrders((prev) =>
      prev.map((product) => {
        if (product.productId !== productId) return product;
        
        // เช็คว่า variant นี้อยู่ในรายการแล้วหรือไม่
        const exists = product.variants.some(v => v.variantId === newVariant._id);
        if (exists) return product;
        
        // เพิ่ม variant ใหม่
        const newVariantItem = {
          ...newVariant,
          productId,
          productName: product.productName,
          variantId: newVariant._id,
          recommendedOrderQty: 0,
          currentStock: newVariant.stockOnHand || 0,
          dailySalesRate: 0,
          _allocatedQty: 0,
          _netOrder: 0
        };
        
        const updatedVariants = [...product.variants, newVariantItem];
        const newTotalRecommended = updatedVariants.reduce((sum, v) => sum + (v.recommendedOrderQty || 0), 0);
        
        return {
          ...product,
          variants: updatedVariants,
          totalRecommended: newTotalRecommended
        };
      })
    );
    setShowAddVariantModal(null);
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
                          const isFastMoverForMOQ = variant._isFastMoverAddedForMOQ;

                          return (
                            <div key={idx} className={`rounded p-3 border ${isFastMoverForMOQ ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}>
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-gray-800">{variant.sku}</p>
                                    {isFastMoverForMOQ && (
                                      <span className="px-2 py-0.5 bg-blue-200 text-blue-700 text-xs rounded-full font-semibold">
                                        ⭐ Fast Mover (MOQ)
                                      </span>
                                    )}
                                  </div>
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

                      {product.minOrderQty > 0 && product.variants.some(v => v._isFastMoverAddedForMOQ) && (
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-300 rounded">
                          <p className="text-xs text-blue-700">
                            <strong>💡 Smart MOQ Fill:</strong> ได้เพิ่ม Variant ที่มีอัตราขายดี (Fast Movers) เข้ามาเพื่อให้ครบขั้นต่ำการสั่ง
                            <br/>ระบบแนะนำจากสินค้าที่มีการขายดี เพื่อให้ไม่เสียเวลากำลังการผลิต
                          </p>
                        </div>
                      )}

                      {product.minOrderQty > 0 && !product.variants.some(v => v._isFastMoverAddedForMOQ) && product.minOrderQty > product.totalNetOrder && (
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded">
                          <p className="text-xs text-amber-700">
                            <strong>💡 MOQ Adjustment:</strong> เพิ่ม{' '}
                            <strong>{fmtNumber.format(product.minOrderQty - product.totalNetOrder)}</strong> ชิ้นเพื่อให้ครบขั้นต่ำการสั่ง ({fmtNumber.format(product.minOrderQty)} ชิ้น)
                            โดยแบ่งตามสัดส่วนยอดขายของแต่ละ Variant
                          </p>
                        </div>
                      )}
                      
                      {/* ปุ่มเพิ่ม variant */}
                      <button
                        onClick={() => setShowAddVariantModal({
                          productId: product.productId,
                          productName: product.productName,
                          allVariants: productVariantsMap.get(String(product.productId)) || []
                        })}
                        className="mt-3 w-full py-2 px-3 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700 rounded text-sm font-medium transition-colors"
                      >
                        ➕ เพิ่ม Variant อื่นๆ
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal เลือก Variant */}
      {showAddVariantModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-gray-800">{showAddVariantModal.productName}</h3>
                <p className="text-sm text-gray-500">เลือก Variant ที่ต้องการเพิ่มลงในการสั่ง</p>
              </div>
              <button
                onClick={() => setShowAddVariantModal(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>
            
            <div className="p-4 space-y-2">
              {(() => {
                const allVariants = showAddVariantModal.allVariants || [];
                const currentVariants = orders.find(p => p.productId === showAddVariantModal.productId)?.variants || [];
                const filtered = allVariants.filter(v => !currentVariants.some(pv => pv.sku === v.sku));
                
                console.log('🔍 Debug Modal:', {
                  allVariants: allVariants.length,
                  currentVariants: currentVariants.length,
                  currentSkus: currentVariants.map(v => v.sku),
                  allSkus: allVariants.map(v => v.sku),
                  filtered: filtered.length,
                  filteredSkus: filtered.map(v => v.sku)
                });
                
                return filtered.length > 0 ? (
                  filtered.map((variant) => (
                    <button
                      key={variant._id}
                      onClick={() => addVariantToOrder(showAddVariantModal.productId, variant)}
                      className="w-full text-left p-3 border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-400 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-800">{variant.sku}</p>
                          <p className="text-sm text-gray-500">ราคา: {fmtNumber.format(variant.price || 0)} บาท</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-700">
                            คงเหลือ: {fmtNumber.format(variant.stockOnHand || 0)} ชิ้น
                          </p>
                          <p className="text-xs text-green-600">+ เพิ่มไปยังการสั่ง</p>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-center text-gray-500">
                    <p>❌ ไม่มี Variant ใหม่ที่สามารถเพิ่มได้</p>
                    <p className="text-xs mt-2 text-gray-400">
                      (ทั้งหมด: {allVariants.length}, ใช้แล้ว: {currentVariants.length})
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
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
