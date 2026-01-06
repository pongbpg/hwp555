import { useEffect, useState } from 'react';
import useChatStore from '../store/chatStore.js';
import { useSocket } from '../utils/socketClient.js';
import PageSelector from '../components/chat/PageSelector.jsx';
import ConversationList from '../components/chat/ConversationList.jsx';
import ChatPanel from '../components/chat/ChatPanel.jsx';

export default function Chat() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');

  // Chat store
  const {
    pages,
    selectedPageId,
    selectedConversationId,
    loading,
    error,
    fetchPages,
    selectPage,
    registerSocketListeners,
    reset
  } = useChatStore();

  // Socket connection
  const { isConnected } = useSocket(token, user._id);

  // Local state
  const [mounted, setMounted] = useState(false);

  // Initialize on mount
  useEffect(() => {
    if (!token || !user._id) return;

    setMounted(true);
    fetchPages();
    registerSocketListeners();

    return () => {
      reset();
    };
  }, [token, user._id]);

  if (!mounted) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="flex h-[calc(100vh-80px)] bg-white rounded-lg shadow">
      {/* Header with Page Selector */}
      <div className="absolute top-0 right-0 z-20 p-4 flex items-center gap-4 bg-white border-b">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-sm text-gray-600">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Sidebar: Page Selector & Conversation List */}
      <div className="w-96 border-r border-gray-200 flex flex-col">
        {/* Page Selector */}
        {pages.length > 0 && (
          <PageSelector
            pages={pages}
            selectedPageId={selectedPageId}
            onSelectPage={selectPage}
            isLoading={loading}
          />
        )}

        {/* Conversations List */}
        {selectedPageId ? (
          <ConversationList isLoading={loading} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <p>Select a page to start chatting</p>
          </div>
        )}
      </div>

      {/* Main: Chat Panel */}
      <div className="flex-1 flex flex-col">
        {selectedConversationId ? (
          <ChatPanel />
        ) : selectedPageId ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <p>Select a conversation to start chatting</p>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <p>Select a page first</p>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow">
          {error}
        </div>
      )}
    </div>
  );
}
