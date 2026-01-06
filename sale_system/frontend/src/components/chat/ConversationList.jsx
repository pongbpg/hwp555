import { useEffect } from 'react';
import useChatStore from '../../store/chatStore.js';

export default function ConversationList({ isLoading }) {
  const {
    selectedPageId,
    conversations,
    selectedConversationId,
    unreadCounts,
    fetchConversations,
    selectConversation,
    searchConversations
  } = useChatStore();

  useEffect(() => {
    if (selectedPageId) {
      fetchConversations(selectedPageId);
    }
  }, [selectedPageId]);

  const handleSearch = (query) => {
    if (query.trim()) {
      searchConversations(query, selectedPageId);
    } else {
      fetchConversations(selectedPageId);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Search */}
      <div className="p-4 border-b border-gray-200">
        <input
          type="text"
          placeholder="Search conversations..."
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500"
        />
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Loading...</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">No conversations</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {conversations.map((conversation) => (
              <ConversationItem
                key={conversation._id}
                conversation={conversation}
                isSelected={selectedConversationId === conversation._id}
                unreadCount={unreadCounts[conversation._id] || conversation.unreadCount || 0}
                onClick={() => selectConversation(conversation._id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationItem({ conversation, isSelected, unreadCount, onClick }) {
  const formatDate = (date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div
      onClick={onClick}
      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
        isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-medium text-gray-900 flex-1 truncate">
          {conversation.customerName || 'Unknown'}
        </h3>
        <span className="text-xs text-gray-500 flex-shrink-0">
          {formatDate(conversation.lastMessageAt)}
        </span>
      </div>

      <p className="text-sm text-gray-600 truncate mb-2">
        {conversation.lastMessage || '[No messages]'}
      </p>

      {unreadCount > 0 && (
        <div className="flex justify-end">
          <span className="inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full">
            {unreadCount}
          </span>
        </div>
      )}
    </div>
  );
}
