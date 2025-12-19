import { NavLink, Outlet } from 'react-router-dom';

export default function Layout({ onLogout }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>Stock System</h2>
        <NavLink to="/products" className={({ isActive }) => (isActive ? 'active' : '')}>
          Products
        </NavLink>
        <NavLink to="/orders" className={({ isActive }) => (isActive ? 'active' : '')}>
          Orders
        </NavLink>
        <NavLink to="/insights" className={({ isActive }) => (isActive ? 'active' : '')}>
          Insights
        </NavLink>
        <button className="button secondary" onClick={onLogout} style={{ marginTop: 'auto' }}>
          Logout
        </button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
