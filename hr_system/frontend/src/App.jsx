import React, { useState } from 'react';
import { Link, useNavigate, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Attendance from './pages/Attendance';
import KPI from './pages/KPI';
import Salary from './pages/Salary';
import './index.css';

function App() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')));
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    navigate('/login');
  };

  if (!user) {
    return (
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Login onLogin={setUser} />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navigation */}
      <nav className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-blue-600">HR System</h1>
            </div>
            <div className="hidden md:flex space-x-4">
              <Link to="/" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">Dashboard</Link>
              <Link to="/employees" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">Employees</Link>
              <Link to="/attendance" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">Attendance</Link>
              <Link to="/kpi" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">KPI</Link>
              <Link to="/salary" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium">Salary</Link>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700 text-sm">{user.firstName} {user.lastName}</span>
              <button
                onClick={handleLogout}
                className="bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto">
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/kpi" element={<KPI />} />
          <Route path="/salary" element={<Salary />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
