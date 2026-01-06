import { useEffect, useRef, useState } from 'react';
import useChatStore from '../../store/chatStore.js';

export default function ChatPanel() {
  const {
    selectedConversationId,
    selectedPageId,
    messages,
    loading,
    typingUsers,
    sendMessage,
    emitTyping,
    stopTyping,
    closeConversation,
    fetchConversations
  } = useChatStore();

  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const conversationMessages = messages[selectedConversationId] || [];
  const currentTypingUser = typingUsers[selectedConversationId];

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationMessages]);

  // Handle typing indicator
  const handleInputChange = (e) => {
    const value = e.target.value;
    setMessageInput(value);

    if (value.trim() && selectedConversationId) {
      emitTyping(selectedConversationId, 'Admin');

      // Clear timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Set new timeout
      typingTimeoutRef.current = setTimeout(() => {
        stopTyping(selectedConversationId);
      }, 3000);
    }
  };

  // Send message
  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!messageInput.trim() || !selectedConversationId) return;

    setIsSending(true);
    try {
      await sendMessage(selectedConversationId, messageInput);
      setMessageInput('');
      stopTyping(selectedConversationId);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleCloseConversation = async () => {
    if (window.confirm('Close this conversation?')) {
      await closeConversation(selectedConversationId);
      await fetchConversations(selectedPageId);
    }
  };

  if (!selectedConversationId) {
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <ChatHeader onClose={handleCloseConversation} />

      {/* Messages Area */}
      <div className="flex-1 overflow-auto p-4 space-y-4 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Loading messages...</p>
          </div>
        ) : conversationMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">No messages yet</p>
          </div>
        ) : (
          conversationMessages.map((message) => (
            <Message key={message._id} message={message} />
          ))
        )}

        {/* Typing Indicator */}
        {currentTypingUser && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
            </div>
            <span>{currentTypingUser} is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <MessageInput
        value={messageInput}
        onChange={handleInputChange}
        onSend={handleSendMessage}
        isLoading={isSending}
      />
    </div>
  );
}

function ChatHeader({ onClose }) {
  const { conversations, selectedConversationId } = useChatStore();
  const conversation = conversations.find((c) => c._id === selectedConversationId);

  return (
    <div className="border-b border-gray-200 p-4 flex items-center justify-between bg-white">
      <div>
        <h2 className="text-lg font-bold text-gray-900">
          {conversation?.customerName || 'Loading...'}
        </h2>
        <p className="text-sm text-gray-500">
          {conversation?.messageCount || 0} messages
        </p>
      </div>

      <button
        onClick={onClose}
        className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded"
      >
        Close Chat
      </button>
    </div>
  );
}

function Message({ message }) {
  const isAdmin = message.sender === 'admin';

  const formatTime = (date) => {
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-xs px-4 py-2 rounded-lg ${
          isAdmin
            ? 'bg-blue-500 text-white rounded-br-none'
            : 'bg-white text-gray-900 border border-gray-200 rounded-bl-none'
        }`}
      >
        <p className="text-sm break-words">{message.content}</p>
        <p
          className={`text-xs mt-1 ${
            isAdmin ? 'text-blue-100' : 'text-gray-500'
          }`}
        >
          {formatTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

function MessageInput({ value, onChange, onSend, isLoading }) {
  return (
    <form onSubmit={onSend} className="border-t border-gray-200 p-4 bg-white">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={onChange}
          placeholder="Type a message..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-blue-500"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={!value.trim() || isLoading}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </form>
  );
}
