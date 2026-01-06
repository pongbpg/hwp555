import { NavLink } from 'react-router-dom'

export default function Sidebar({ isOpen, user, onLogout, onToggleSidebar }) {
    const canViewAnalytics = user && ['owner', 'stock'].includes(user.role)

    const linkClass = ({ isActive }) =>
        `flex items-center space-x-2 px-4 py-2 rounded transition ${isActive ? 'bg-blue-600 text-white' : 'text-white hover:bg-gray-800'
        }`

    return (
        <aside className={`${isOpen ? 'w-64' : 'w-20'} bg-gray-900 text-white transition-all duration-300 flex flex-col`}>
            <div className="p-4 border-b border-gray-700">
                <h1 className={`font-bold text-xl ${isOpen ? '' : 'text-center'}`}>
                    {isOpen ? '📦 Stock System' : '📦'}
                </h1>
            </div>

            <nav className="flex-1 p-4 space-y-2">
                {canViewAnalytics && (
                    <NavLink to="/dashboard" className={linkClass}>
                        <span className="text-lg">📊</span>
                        {isOpen && <span>Dashboard</span>}
                    </NavLink>
                )}
                <NavLink to="/products" className={linkClass}>
                    <span className="text-lg">📦</span>
                    {isOpen && <span>Products</span>}
                </NavLink>
                <NavLink to="/categories-brands" className={linkClass}>
                    <span className="text-lg">📁</span>
                    {isOpen && <span>Categories</span>}
                </NavLink>
                <NavLink to="/orders" className={linkClass}>
                    <span className="text-lg">📋</span>
                    {isOpen && <span>Orders</span>}
                </NavLink>
                <NavLink to="/movements" className={linkClass}>
                    <span className="text-lg">🔄</span>
                    {isOpen && <span>Movements</span>}
                </NavLink>
                {canViewAnalytics && (
                    <>
                        <NavLink to="/alerts" className={linkClass}>
                            <span className="text-lg">🔔</span>
                            {isOpen && <span>Alerts</span>}
                        </NavLink>
                        <NavLink to="/insights" className={linkClass}>
                            <span className="text-lg">📈</span>
                            {isOpen && <span>Insights</span>}
                        </NavLink>
                        <NavLink to="/replenishment" className={linkClass}>
                            <span className="text-lg">📦</span>
                            {isOpen && <span>Replenishment</span>}
                        </NavLink>
                    </>
                )}
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
