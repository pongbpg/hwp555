import { NavLink } from 'react-router-dom'

export default function Sidebar({ isOpen, user, onLogout, onToggleSidebar }) {
    const canViewAnalytics = user && ['owner', 'stock'].includes(user.role)

    const linkClass = ({ isActive }) =>
        `flex items-center space-x-2 px-4 py-3 rounded transition text-base ${isActive ? 'bg-blue-600 text-white' : 'text-white hover:bg-gray-800'
        }`

    return (
        <>
            {/* Mobile backdrop overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
                    onClick={onToggleSidebar}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed top-0 left-0 h-full z-40 bg-gray-900 text-white flex flex-col transition-transform duration-300
                lg:relative lg:z-auto lg:translate-x-0 lg:flex-shrink-0
                ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0 lg:w-20'}
            `}>
                <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                    <h1 className={`font-bold text-xl ${isOpen ? '' : 'lg:text-center lg:w-full'}`}>
                        {isOpen ? '📦 Stock System' : <span className="hidden lg:block text-center w-full">📦</span>}
                        {!isOpen && <span className="lg:hidden">📦 Stock System</span>}
                    </h1>
                    {/* Close button for mobile */}
                    <button
                        onClick={onToggleSidebar}
                        className="lg:hidden text-gray-400 hover:text-white p-1"
                    >
                        ✕
                    </button>
                </div>

                <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                    {canViewAnalytics && (
                        <NavLink to="/dashboard" className={linkClass} onClick={() => { if (window.innerWidth < 1024) onToggleSidebar?.() }}>
                            <span className="text-xl flex-shrink-0">📊</span>
                            {isOpen && <span>Dashboard</span>}
                            {!isOpen && <span className="lg:hidden">Dashboard</span>}
                        </NavLink>
                    )}
                    <NavLink to="/products" className={linkClass} onClick={() => { if (window.innerWidth < 1024) onToggleSidebar?.() }}>
                        <span className="text-xl flex-shrink-0">📦</span>
                        {isOpen && <span>Products</span>}
                        {!isOpen && <span className="lg:hidden">Products</span>}
                    </NavLink>
                    <NavLink to="/categories-brands" className={linkClass} onClick={() => { if (window.innerWidth < 1024) onToggleSidebar?.() }}>
                        <span className="text-xl flex-shrink-0">📁</span>
                        {isOpen && <span>Categories</span>}
                        {!isOpen && <span className="lg:hidden">Categories</span>}
                    </NavLink>
                    <NavLink to="/orders" className={linkClass} onClick={() => { if (window.innerWidth < 1024) onToggleSidebar?.() }}>
                        <span className="text-xl flex-shrink-0">📋</span>
                        {isOpen && <span>Orders</span>}
                        {!isOpen && <span className="lg:hidden">Orders</span>}
                    </NavLink>
                    <NavLink to="/movements" className={linkClass} onClick={() => { if (window.innerWidth < 1024) onToggleSidebar?.() }}>
                        <span className="text-xl flex-shrink-0">🔄</span>
                        {isOpen && <span>Movements</span>}
                        {!isOpen && <span className="lg:hidden">Movements</span>}
                    </NavLink>
                    {canViewAnalytics && (
                        <>
                            <NavLink to="/alerts" className={linkClass} onClick={() => { if (window.innerWidth < 1024) onToggleSidebar?.() }}>
                                <span className="text-xl flex-shrink-0">🔔</span>
                                {isOpen && <span>Alerts</span>}
                                {!isOpen && <span className="lg:hidden">Alerts</span>}
                            </NavLink>
                            <NavLink to="/insights" className={linkClass} onClick={() => { if (window.innerWidth < 1024) onToggleSidebar?.() }}>
                                <span className="text-xl flex-shrink-0">📈</span>
                                {isOpen && <span>Insights</span>}
                                {!isOpen && <span className="lg:hidden">Insights</span>}
                            </NavLink>
                            <NavLink to="/replenishment" className={linkClass} onClick={() => { if (window.innerWidth < 1024) onToggleSidebar?.() }}>
                                <span className="text-xl flex-shrink-0">🛒</span>
                                {isOpen && <span>Replenishment</span>}
                                {!isOpen && <span className="lg:hidden">Replenishment</span>}
                            </NavLink>
                        </>
                    )}
                </nav>

                {onLogout && (
                    <div className="border-t border-gray-700 p-3">
                        <button
                            onClick={onLogout}
                            className="w-full px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors flex items-center justify-center space-x-2"
                        >
                            <span>🚪</span>
                            {isOpen && <span>Logout</span>}
                            {!isOpen && <span className="lg:hidden">Logout</span>}
                        </button>
                    </div>
                )}
            </aside>
        </>
    )
}
