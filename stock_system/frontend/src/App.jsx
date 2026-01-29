import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Products from './pages/Products.jsx';
import Orders from './pages/Orders.jsx';
import Movements from './pages/Movements.jsx';
import Alerts from './pages/Alerts.jsx';
import Insights from './pages/Insights.jsx';
import ReplenishmentOrder from './pages/ReplenishmentOrder.jsx';
import CategoriesBrands from './pages/CategoriesBrands.jsx';
import DebugInsights from './pages/DebugInsights.jsx';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import { setAuthToken } from './api.js';

const Protected = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  setAuthToken(token);
  return children;
};

// Protected route for analytics (Dashboard, Insights, Alerts)
const AnalyticsRoute = ({ children, user }) => {
  const canView = user && ['owner', 'stock'].includes(user.role);
  if (!canView) return <Navigate to="/products" replace />;
  return children;
};

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (token) setAuthToken(token);
  }, [token]);

  const handleLogin = (newToken, userData) => {
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    navigate('/login');
  };

  // Determine default route based on role
  const defaultRoute = user && ['owner', 'stock'].includes(user.role) ? '/dashboard' : '/products';

  return (
    <Routes>
      <Route path="/login" element={<Login onLogin={handleLogin} />} />
      <Route
        path="/*"
        element={
          <Protected>
            <div className="flex h-screen bg-gray-100">
              <Sidebar isOpen={sidebarOpen} onLogout={handleLogout} user={user} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
              <div className="flex-1 flex flex-col overflow-hidden">
                <Header onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} onLogout={handleLogout} user={user} />
                <main className="flex-1 overflow-auto p-6">
                  <Routes>
                    <Route index element={<Navigate to={defaultRoute} replace />} />
                    <Route path="/dashboard" element={
                      <AnalyticsRoute user={user}>
                        <Dashboard />
                      </AnalyticsRoute>
                    } />
                    <Route path="/products" element={<Products />} />
                    <Route path="/categories-brands" element={<CategoriesBrands />} />
                    <Route path="/orders" element={<Orders />} />
                    <Route path="/movements" element={<Movements />} />
                    <Route path="/alerts" element={
                      <AnalyticsRoute user={user}>
                        <Alerts />
                      </AnalyticsRoute>
                    } />
                    <Route path="/insights" element={
                      <AnalyticsRoute user={user}>
                        <Insights />
                      </AnalyticsRoute>
                    } />
                    <Route path="/replenishment" element={
                      <AnalyticsRoute user={user}>
                        <ReplenishmentOrder />
                      </AnalyticsRoute>
                    } />
                    <Route path="/debug-insights" element={
                      <Protected>
                        <DebugInsights />
                      </Protected>
                    } />
                  </Routes>
                </main>
              </div>
            </div>
          </Protected>
        }
      />
    </Routes>
  );
}
