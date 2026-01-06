import { useState, useEffect } from 'react'
import { customerApi } from '../api'

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    try {
      const response = await customerApi.getAll()
      setCustomers(response.data)
    } catch (error) {
      console.error('Error fetching customers:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="text-center py-8">Loading...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Customers</h1>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Name</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Phone</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Orders</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Total Spent</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {customers.map(customer => (
                <tr key={customer._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {customer.name || customer.facebookName || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{customer.phone || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{customer.totalOrders}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                    ฿{customer.totalSpent.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(customer.createdAt).toLocaleDateString('th-TH')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {customers.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-600">
          No customers yet
        </div>
      )}
    </div>
  )
}
