import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { orderApi } from '../api'

export default function OrderDetail() {
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOrder()
  }, [orderId])

  const fetchOrder = async () => {
    try {
      const response = await orderApi.getById(orderId)
      setOrder(response.data)
    } catch (error) {
      console.error('Error fetching order:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusUpdate = async (newStatus) => {
    try {
      await orderApi.updateStatus(orderId, newStatus)
      fetchOrder()
    } catch (error) {
      console.error('Error updating order:', error)
    }
  }

  const handlePrintSlip = () => {
    window.open(`/api/orders/${orderId}/shipping-slip`, '_blank')
  }

  const handlePrintInvoice = () => {
    window.open(`/api/orders/${orderId}/invoice`, '_blank')
  }

  if (loading) return <div className="text-center py-8">Loading...</div>
  if (!order) return <div className="text-center py-8">Order not found</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Order #{order.orderId}</h1>
          <p className="text-gray-600 mt-1">Created: {new Date(order.createdAt).toLocaleDateString('th-TH')}</p>
        </div>
        <div className="flex space-x-3">
          <button onClick={handlePrintSlip} className="btn btn-secondary">📄 Shipping Slip</button>
          <button onClick={handlePrintInvoice} className="btn btn-secondary">🧾 Invoice</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Info */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Customer Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Name</p>
                <p className="font-medium">{order.customerName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Phone</p>
                <p className="font-medium">{order.customerPhone}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-gray-600">Address</p>
                <p className="font-medium">
                  {order.shippingAddress}, {order.shippingCity} {order.shippingProvince} {order.shippingPostalCode}
                </p>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Order Items</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="text-left py-2">SKU</th>
                    <th className="text-left py-2">Product</th>
                    <th className="text-right py-2">Qty</th>
                    <th className="text-right py-2">Price</th>
                    <th className="text-right py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {order.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2 text-gray-600">{item.sku}</td>
                      <td className="py-2">{item.name}</td>
                      <td className="text-right py-2">{item.quantity}</td>
                      <td className="text-right py-2">฿{item.price.toFixed(2)}</td>
                      <td className="text-right py-2 font-medium">฿{item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Order Status</h2>
            <div className="space-y-2">
              {['pending', 'confirmed', 'packed', 'shipped', 'delivered'].map(status => (
                <button
                  key={status}
                  onClick={() => handleStatusUpdate(status)}
                  className={`w-full px-3 py-2 rounded text-sm font-medium transition ${
                    order.status === status
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-medium">฿{order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping:</span>
                <span className="font-medium">฿{order.shippingFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax (7%):</span>
                <span className="font-medium">฿{order.taxAmount.toFixed(2)}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between font-bold">
                <span>Total:</span>
                <span className="text-lg">฿{order.totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Payment</h2>
            <div className="space-y-2">
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <p className="font-medium capitalize">{order.paymentStatus}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Method</p>
                <p className="font-medium">{order.paymentMethod || '-'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
