import { useState, useEffect } from 'react'
import { reportApi } from '../api'

export default function Reports() {
  const [summary, setSummary] = useState(null)
  const [topCustomers, setTopCustomers] = useState([])
  const [orderStatus, setOrderStatus] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchReports()
  }, [])

  const fetchReports = async () => {
    try {
      const [summaryRes, customersRes, statusRes] = await Promise.all([
        reportApi.getSalesSummary(),
        reportApi.getTopCustomers(5),
        reportApi.getOrderStatus()
      ])
      
      setSummary(summaryRes.data)
      setTopCustomers(customersRes.data)
      setOrderStatus(statusRes.data)
    } catch (error) {
      console.error('Error fetching reports:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="text-center py-8">Loading...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Reports & Analytics</h1>

      {/* Sales Overview */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard title="Total Orders" value={summary.totalOrders} />
          <StatCard title="Today Orders" value={summary.todayOrders} />
          <StatCard title="Total Sales" value={`฿${summary.totalSales.toFixed(2)}`} />
          <StatCard title="Today Sales" value={`฿${summary.todaySales.toFixed(2)}`} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Customers */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Top Customers</h2>
          <div className="space-y-3">
            {topCustomers.map((customer, idx) => (
              <div key={customer._id} className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center space-x-3">
                  <span className="font-semibold text-gray-400 text-lg">{idx + 1}</span>
                  <div>
                    <p className="font-medium text-gray-900">
                      {customer.name || customer.facebookName || 'Unknown'}
                    </p>
                    <p className="text-sm text-gray-600">{customer.totalOrders} orders</p>
                  </div>
                </div>
                <p className="font-semibold text-gray-900">฿{customer.totalSpent.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Order Status Breakdown */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Order Status</h2>
          <div className="space-y-3">
            {orderStatus.map(status => {
              const percentage = Math.round((status.count / summary?.totalOrders) * 100) || 0
              return (
                <div key={status._id}>
                  <div className="flex justify-between mb-1">
                    <span className="capitalize font-medium text-gray-900">{status._id}</span>
                    <span className="text-sm text-gray-600">{status.count} ({percentage}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-sm text-gray-600 mb-2">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
