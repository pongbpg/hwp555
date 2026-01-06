import useChatStore from '../../store/chatStore.js';

export default function PageSelector({ pages, selectedPageId, onSelectPage, isLoading }) {
  return (
    <div className="border-b border-gray-200 p-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Select Page
      </label>
      <select
        value={selectedPageId || ''}
        onChange={(e) => onSelectPage(e.target.value)}
        disabled={isLoading || pages.length === 0}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
      >
        <option value="">-- Choose a page --</option>
        {pages.map((page) => (
          <option key={page._id} value={page._id}>
            {page.pageName}
            {page.unreadCount > 0 && ` (${page.unreadCount})`}
          </option>
        ))}
      </select>
    </div>
  );
}
