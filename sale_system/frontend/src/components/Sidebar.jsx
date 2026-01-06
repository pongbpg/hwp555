import { Link, useLocation } from 'react-router-dom'

export default function Sidebar({ isOpen, onLogout, user }) {
  const location = useLocation()

  const isActive = (path) => location.pathname === path

  return (
    <aside className={`${isOpen ? 'w-64' : 'w-20'} bg-gray-900 text-white transition-all duration-300 flex flex-col`}>
      <div className="p-4 border-b border-gray-700">
        <h1 className={`font-bold text-xl ${isOpen ? '' : 'text-center'}`}>
          {isOpen ? '🛍️ Sale System' : '🛍️'}
        </h1>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <NavLink to="/" isActive={isActive('/')} isOpen={isOpen} label="Dashboard" icon="📊" />
        <NavLink to="/orders" isActive={isActive('/orders')} isOpen={isOpen} label="Orders" icon="📦" />
        <NavLink to="/customers" isActive={isActive('/customers')} isOpen={isOpen} label="Customers" icon="👥" />
        <NavLink to="/chat" isActive={isActive('/chat')} isOpen={isOpen} label="Chat" icon="💬" />
        <NavLink to="/reports" isActive={isActive('/reports')} isOpen={isOpen} label="Reports" icon="📈" />
      </nav>

      {onLogout && (
        <div className="border-t border-gray-700 p-4">
          <button
            onClick={onLogout}
            className="w-full px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors flex items-center justify-center space-x-2"
          >
            <span>🚪</span>
            {isOpen && <span>Logout</span>}
          </button>
        </div>
      )}
    </aside>
  )
}

function NavLink({ to, isActive, isOpen, label, icon }) {
  return (
    <Link
      to={to}
      className={`flex items-center space-x-2 px-4 py-2 rounded transition ${
        isActive ? 'bg-blue-600' : 'hover:bg-gray-800'
      }`}
      title={isOpen ? '' : label}
    >
      <span className="text-lg">{icon}</span>
      {isOpen && <span>{label}</span>}
    </Link>
  )
}
