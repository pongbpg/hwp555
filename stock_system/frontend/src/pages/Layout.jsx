import { NavLink, Outlet } from 'react-router-dom';

export default function Layout({ onLogout, user }) {
  const linkClass = ({ isActive }) =>
    `block px-3 py-2 rounded-lg transition-colors ${
      isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
    }`;

  // สิทธิ์เข้าถึง Dashboard และ Insights
  const canViewAnalytics = user && ['owner', 'stock'].includes(user.role);

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 text-slate-200 p-4 flex flex-col gap-2">
        <h2 className="text-lg font-bold mb-4 text-white">📦 Stock System</h2>
        <nav className="flex flex-col gap-1">
          {canViewAnalytics && (
            <NavLink to="/dashboard" className={linkClass}>
              📊 Dashboard
            </NavLink>
          )}
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
          {canViewAnalytics && (
            <>
              <NavLink to="/alerts" className={linkClass}>
                🔔 Alerts
              </NavLink>
              <NavLink to="/insights" className={linkClass}>
                📈 Insights
              </NavLink>
              <NavLink to="/replenishment" className={linkClass}>
                📦 Replenishment
              </NavLink>
            </>
          )}
        </nav>
        <div className="mt-auto space-y-2">
          <div className="px-3 py-2 text-xs text-slate-400">
            👤 {user?.firstName} ({user?.role})
          </div>
          <button
            onClick={onLogout}
            className="w-full px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-colors"
          >
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
