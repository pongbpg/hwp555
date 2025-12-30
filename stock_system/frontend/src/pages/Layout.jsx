import { NavLink, Outlet } from 'react-router-dom';

export default function Layout({ onLogout }) {
  const linkClass = ({ isActive }) =>
    `block px-3 py-2 rounded-lg transition-colors ${
      isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
    }`;

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 text-slate-200 p-4 flex flex-col gap-2">
        <h2 className="text-lg font-bold mb-4 text-white">📦 Stock System</h2>
        <nav className="flex flex-col gap-1">
          <NavLink to="/dashboard" className={linkClass}>
            📊 Dashboard
          </NavLink>
          <NavLink to="/products" className={linkClass}>
            📦 Products
          </NavLink>
          <NavLink to="/categories-brands" className={linkClass}>
            📁 Categories
          </NavLink>
          <NavLink to="/orders" className={linkClass}>
            📋 Orders
          </NavLink>
          <NavLink to="/movements" className={linkClass}>
            🔄 Movements
          </NavLink>
          <NavLink to="/alerts" className={linkClass}>
            🔔 Alerts
          </NavLink>
          <NavLink to="/insights" className={linkClass}>
            📈 Insights
          </NavLink>
        </nav>
        <button
          onClick={onLogout}
          className="mt-auto px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-colors"
        >
          🚪 Logout
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
