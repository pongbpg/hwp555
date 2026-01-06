import { useState, useEffect } from 'react'
import { reportApi } from '../api'

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSummary()
  }, [])

  const fetchSummary = async () => {
    try {
      const response = await reportApi.getSalesSummary()
      setSummary(response.data)
    } catch (error) {
      console.error('Error fetching summary:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="text-center py-8">Loading...</div>
  if (!summary) return <div className="text-center py-8">No data available</div>

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Orders"
          value={summary.totalOrders}
          icon="📦"
          color="blue"
        />
        <StatCard
          title="Today's Orders"
          value={summary.todayOrders}
          icon="📅"
          color="green"
        />
        <StatCard
          title="Total Sales"
          value={`฿${summary.totalSales.toFixed(2)}`}
          icon="💰"
          color="purple"
        />
        <StatCard
          title="Today's Sales"
          value={`฿${summary.todaySales.toFixed(2)}`}
          icon="💵"
          color="orange"
        />
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Quick Stats</h2>
        <div className="text-gray-600">
          <p className="mb-2">✅ System is running smoothly</p>
          <p>📊 Use the Reports page for detailed analytics</p>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
    orange: 'bg-orange-50 border-orange-200'
  }

  return (
    <div className={`${colorClasses[color]} border rounded-lg p-6`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-800 mt-2">{value}</p>
        </div>
        <span className="text-4xl">{icon}</span>
      </div>
    </div>
  )
}
