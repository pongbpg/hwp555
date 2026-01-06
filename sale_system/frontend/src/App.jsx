import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './index.css'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import OrderDetail from './pages/OrderDetail'
import Customers from './pages/Customers'
import Chat from './pages/Chat'
import PageSettings from './pages/PageSettings'
import Reports from './pages/Reports'
import Login from './pages/Login'
import { setAuthToken } from './api'

const Protected = ({ children }) => {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  setAuthToken(token)
  return children
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user')
    return saved ? JSON.parse(saved) : null
  })
  const navigate = useNavigate()

  useEffect(() => {
    if (token) setAuthToken(token)
  }, [token])

  const handleLogin = (newToken, userData) => {
    setToken(newToken)
    setUser(userData)
    localStorage.setItem('user', JSON.stringify(userData))
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
    navigate('/login')
  }

  return (
    <Routes>
      <Route path="/login" element={<Login onLogin={handleLogin} />} />
      <Route
        path="/*"
        element={
          <Protected>
            <div className="flex h-screen bg-gray-100">
              <Sidebar isOpen={sidebarOpen} onLogout={handleLogout} user={user} />
              <div className="flex-1 flex flex-col overflow-hidden">
                <Header onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} onLogout={handleLogout} user={user} />
                <main className="flex-1 overflow-auto p-6">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/orders" element={<Orders />} />
                    <Route path="/orders/:orderId" element={<OrderDetail />} />
                    <Route path="/customers" element={<Customers />} />
                    <Route path="/chat" element={<Chat />} />
                    <Route path="/pages" element={<PageSettings />} />
                    <Route path="/reports" element={<Reports />} />
                  </Routes>
                </main>
              </div>
            </div>
          </Protected>
        }
      />
    </Routes>
  )
}

export default App
