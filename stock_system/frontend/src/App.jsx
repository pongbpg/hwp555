import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Products from './pages/Products.jsx';
import Orders from './pages/Orders.jsx';
import Movements from './pages/Movements.jsx';
import Alerts from './pages/Alerts.jsx';
import Insights from './pages/Insights.jsx';
import CategoriesBrands from './pages/CategoriesBrands.jsx';
import Layout from './pages/Layout.jsx';
import { setAuthToken } from './api.js';

const Protected = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  setAuthToken(token);
  return children;
};

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const navigate = useNavigate();

  useEffect(() => {
    if (token) setAuthToken(token);
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    navigate('/login');
  };

  return (
    <Routes>
      <Route path="/login" element={<Login onLogin={setToken} />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout onLogout={handleLogout} />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/categories-brands" element={<CategoriesBrands />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/movements" element={<Movements />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/insights" element={<Insights />} />
      </Route>
    </Routes>
  );
}
