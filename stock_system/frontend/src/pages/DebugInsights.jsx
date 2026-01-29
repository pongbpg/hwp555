import { useState } from 'react';
import api from '../api.js';

export default function DebugInsights() {
  const [variantId, setVariantId] = useState('');
  const [loading, setLoading] = useState(false);
  const [receiptsData, setReceiptsData] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [error, setError] = useState('');

  const handleCheckReceipts = async () => {
    if (!variantId) {
      setError('กรุณาใส่ Variant ID');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/debug/debug-receipts/${variantId}`);
      setReceiptsData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckComparison = async () => {
    if (!variantId) {
      setError('กรุณาใส่ Variant ID');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/debug/debug-insights-vs-actual/${variantId}`);
      setComparisonData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">🔍 Debug Insights Data</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex gap-4 mb-6">
          <input
            type="text"
            placeholder="ใส่ Variant ID (ค้นหาจาก Product page)"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-4 py-2"
          />
          <button
            onClick={handleCheckReceipts}
            disabled={loading}
            className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'กำลังตรวจสอบ...' : 'ดูข้อมูล Receipts'}
          </button>
          <button
            onClick={handleCheckComparison}
            disabled={loading}
            className="bg-purple-500 text-white px-6 py-2 rounded hover:bg-purple-600 disabled:opacity-50"
          >
            {loading ? 'กำลังตรวจสอบ...' : 'เปรียบเทียบ'}
          </button>
        </div>

        {error && <div className="text-red-600 text-sm mb-4 p-3 bg-red-50 rounded">{error}</div>}
      </div>

      {/* ข้อมูล Receipts */}
      {receiptsData && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">📦 Receipt Data (Variant: {receiptsData.variantId})</h2>

          <div className="grid grid-cols-5 gap-4 mb-6 p-4 bg-blue-50 rounded">
            <div>
              <div className="text-gray-600 text-sm">Total Orders</div>
              <div className="text-2xl font-bold">{receiptsData.totalOrders}</div>
            </div>
            <div>
              <div className="text-gray-600 text-sm">Active Orders</div>
              <div className="text-2xl font-bold text-blue-600">{receiptsData.activeOrders}</div>
            </div>
            <div>
              <div className="text-gray-600 text-sm">Cancelled</div>
              <div className="text-2xl font-bold text-red-600">{receiptsData.cancelledOrders}</div>
            </div>
            <div>
              <div className="text-gray-600 text-sm">Total Remaining</div>
              <div className="text-2xl font-bold text-orange-600">{receiptsData.totals.totalRemaining}</div>
            </div>
            <div className="border-l-2 border-blue-400">
              <div className="text-gray-600 text-sm">Active Remaining</div>
              <div className="text-2xl font-bold text-green-600">{receiptsData.activeTotals.totalRemaining}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6 text-sm bg-gray-50 p-4 rounded">
            <div>
              <strong>All Orders (รวม cancelled):</strong>
              <div className="mt-2">Ordered: {receiptsData.totals.totalOrdered}</div>
              <div>Received: {receiptsData.totals.totalReceived}</div>
              <div className="font-bold">Remaining: {receiptsData.totals.totalRemaining}</div>
            </div>
            <div>
              <strong>Active Orders (pending/completed):</strong>
              <div className="mt-2">Ordered: {receiptsData.activeTotals.totalOrdered}</div>
              <div>Received: {receiptsData.activeTotals.totalReceived}</div>
              <div className="font-bold text-green-600">Remaining: {receiptsData.activeTotals.totalRemaining}</div>
            </div>
            <div className="bg-yellow-50 p-2 rounded">
              <strong>ข้อสังเกต:</strong>
              <div className="mt-2 text-xs">
                {receiptsData.cancelledOrders > 0 ? (
                  <div className="text-orange-700">
                    ⚠️ มี {receiptsData.cancelledOrders} cancelled order<br/>
                    ถ้า variant.incoming ใช้ "All Orders" = {receiptsData.totals.totalRemaining}<br/>
                    ถ้า variant.incoming ใช้ "Active Orders" = {receiptsData.activeTotals.totalRemaining}
                  </div>
                ) : (
                  <div>✅ ไม่มี cancelled order</div>
                )}
              </div>
            </div>
          </div>

          {receiptsData.orders.map((order, idx) => (
            <div key={idx} className="border border-gray-200 rounded p-4 mb-4">
              <div className="font-bold mb-2">
                {order.reference} - {order.status}
                <span className="text-gray-500 text-sm ml-2">{new Date(order.orderDate).toLocaleDateString('th-TH')}</span>
              </div>

              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border p-2 text-left">SKU</th>
                    <th className="border p-2 text-right">Ordered</th>
                    <th className="border p-2 text-right">Received</th>
                    <th className="border p-2 text-right">Remaining</th>
                    <th className="border p-2">Receipts</th>
                  </tr>
                </thead>
                <tbody>
                  {order.itemsInOrder.map((item, itemIdx) => (
                    <tr key={itemIdx}>
                      <td className="border p-2">{item.sku}</td>
                      <td className="border p-2 text-right">{item.ordered}</td>
                      <td className="border p-2 text-right font-bold text-green-600">{item.received}</td>
                      <td className="border p-2 text-right font-bold text-orange-600">{item.remaining}</td>
                      <td className="border p-2 text-xs">
                        {item.receipts.map((r, rIdx) => (
                          <div key={rIdx} className="mb-1">
                            {r.quantity} ชิ้น ({r.status}) - {r.batchRef}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* เปรียบเทียบ Incoming vs Actual */}
      {comparisonData && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">⚖️ เปรียบเทียบ Incoming vs Actual</h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="border-2 border-blue-200 rounded p-4">
              <div className="text-gray-600 text-sm mb-2">variant.incoming (จาก schema)</div>
              <div className="text-3xl font-bold text-blue-600">{comparisonData.variantIncoming}</div>
            </div>

            <div className="border-2 border-green-200 rounded p-4">
              <div className="text-gray-600 text-sm mb-2">Actual Purchase Remaining (จาก receipts)</div>
              <div className="text-3xl font-bold text-green-600">{comparisonData.actual.purchaseRemaining}</div>
            </div>

            <div className={`border-2 rounded p-4 ${
              comparisonData.incomingVsActual.match === '✅ ตรงกัน'
                ? 'border-green-500 bg-green-50'
                : 'border-red-500 bg-red-50'
            }`}>
              <div className="text-gray-600 text-sm mb-2">Status</div>
              <div className="text-2xl font-bold">
                {comparisonData.incomingVsActual.match === '✅ ตรงกัน' ? (
                  <span className="text-green-600">✅ ตรงกัน</span>
                ) : (
                  <span className="text-red-600">❌ ไม่ตรงกัน</span>
                )}
              </div>
              <div className="text-sm mt-2">
                Diff: {comparisonData.incomingVsActual.incoming - comparisonData.incomingVsActual.actualRemaining}
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded text-sm">
            <div className="mb-2">
              <strong>📝 ข้อมูลละเอียด:</strong>
            </div>
            <div className="mb-2">
              • <strong>Ordered:</strong> {comparisonData.actual.purchaseOrdered} ชิ้น
            </div>
            <div className="mb-2">
              • <strong>Received (จาก receipts):</strong> {comparisonData.actual.purchaseReceived} ชิ้น
            </div>
            <div className="mb-2">
              • <strong>Remaining (calculated):</strong> {comparisonData.actual.purchaseRemaining} ชิ้น
            </div>
          </div>

          {comparisonData.incomingVsActual.match !== '✅ ตรงกัน' && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
              <strong className="text-yellow-800">⚠️ ปัญหา:</strong>
              <p className="text-yellow-700 mt-2">
                variant.incoming ({comparisonData.variantIncoming}) != actual remaining ({comparisonData.actual.purchaseRemaining})
              </p>
              <p className="text-yellow-700 mt-1 text-sm">
                ถ้า Insights ใช้ totalIncoming ที่มาจาก variant.incoming จะแสดงตัวเลขผิด
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 rounded text-sm">
        <strong>💡 วิธีใช้:</strong>
        <ol className="mt-2 list-decimal list-inside space-y-1">
          <li>ไปที่ Products page → ค้นหาสินค้า</li>
          <li>หา variant ID (อักษรยาวๆ ต่อท้าย SKU)</li>
          <li>ใส่ variant ID ตรงนี้</li>
          <li>กด "ดูข้อมูล Receipts" เพื่อดูรายการรับแต่ละครั้ง</li>
          <li>กด "เปรียบเทียบ" เพื่อเช็คว่า variant.incoming ตรงกับ actual remaining หรือไม่</li>
        </ol>
      </div>
    </div>
  );
}
