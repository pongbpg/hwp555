export default function Header({ onSidebarToggle, onLogout, user }) {
    return (
        <header className="bg-white shadow h-14 sm:h-16 flex items-center justify-between px-3 sm:px-6 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
                <button
                    onClick={onSidebarToggle}
                    className="p-2 hover:bg-gray-100 rounded text-xl flex-shrink-0"
                    title="Toggle sidebar"
                >
                    ☰
                </button>
                <h2 className="text-base sm:text-xl font-semibold text-gray-800 truncate hidden sm:block">
                    Stock Management System
                </h2>
                <h2 className="text-base font-semibold text-gray-800 sm:hidden">
                    📦 Stock
                </h2>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
                <span className="text-sm text-gray-600 hidden sm:block">
                    {user ? `${user.firstName} ${user.lastName}` : 'User'}
                </span>
                <span className="text-xs text-gray-600 sm:hidden max-w-[80px] truncate">
                    {user ? user.firstName : 'User'}
                </span>
                {onLogout && (
                    <button
                        onClick={onLogout}
                        className="px-2 sm:px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                    >
                        <span className="hidden sm:inline">Logout</span>
                        <span className="sm:hidden">🚪</span>
                    </button>
                )}
            </div>
        </header>
    )
}
