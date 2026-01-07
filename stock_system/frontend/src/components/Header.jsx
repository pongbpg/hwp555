export default function Header({ onSidebarToggle, onLogout, user }) {
    return (
        <header className="bg-white shadow h-16 flex items-center justify-between px-6 border-b border-gray-200">
            <div className="flex items-center space-x-4">
                <button
                    onClick={onSidebarToggle}
                    className="p-2 hover:bg-gray-100 rounded"
                    title="Toggle sidebar"
                >
                    ☰
                </button>
                <h2 className="text-xl font-semibold text-gray-800">Stock Management System</h2>
            </div>
            <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">
                    {user ? `${user.firstName} ${user.lastName}` : 'User'}
                </span>
                {/* <img
                    src="https://via.placeholder.com/40"
                    alt="Profile"
                    className="w-10 h-10 rounded-full"
                /> */}
                {onLogout && (
                    <button
                        onClick={onLogout}
                        className="ml-4 px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                    >
                        Logout
                    </button>
                )}
            </div>
        </header>
    )
}
