import { create } from 'zustand';
import api from '../api.js';
import socketClient from '../utils/socketClient.js';

/**
 * Chat Store - Manage chat state globally
 * ใช้สำหรับ Page selection, Conversations list, Messages
 */
export const useChatStore = create((set, get) => ({
  // State
  pages: [],
  selectedPageId: null,
  conversations: [],
  selectedConversationId: null,
  messages: {}, // { conversationId: [...messages] }
  loading: false,
  error: null,
  connectionStatus: 'disconnected', // 'connecting', 'connected', 'disconnected'
  unreadCounts: {}, // { pageId: count, conversationId: count }
  typingUsers: {}, // { conversationId: 'User Name' }
  currentUser: null,

  // ============= Page Management =============

  /**
   * ดึงรายการ pages
   */
  fetchPages: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/pages');
      set({ pages: response.data });
    } catch (error) {
      set({ error: error.response?.data?.error || error.message });
    } finally {
      set({ loading: false });
    }
  },

  /**
   * เลือก page เปิดใช้งาน
   */
  selectPage: async (pageId) => {
    const state = get();

    // Leave old page room
    if (state.selectedPageId) {
      socketClient.leavePage(state.selectedPageId);
    }

    // Join new page room
    socketClient.joinPage(pageId);

    set({
      selectedPageId: pageId,
      selectedConversationId: null,
      conversations: [],
      messages: {}
    });

    // Fetch conversations for new page
    await get().fetchConversations(pageId);
  },

  // ============= Conversation Management =============

  /**
   * ดึง conversations สำหรับ page
   */
  fetchConversations: async (pageId, status = 'open') => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/conversations', {
        params: { pageId, status, limit: 50 }
      });
      set({ conversations: response.data.conversations });
    } catch (error) {
      set({ error: error.response?.data?.error || error.message });
    } finally {
      set({ loading: false });
    }
  },

  /**
   * เลือก conversation
   */
  selectConversation: (conversationId) => {
    const state = get();

    // Leave old conversation
    if (state.selectedConversationId) {
      socketClient.leaveConversation(state.selectedConversationId);
    }

    // Join new conversation
    socketClient.joinConversation(conversationId, state.selectedPageId);

    set({ selectedConversationId: conversationId });

    // Fetch messages
    get().fetchMessages(conversationId);
  },

  /**
   * ปิด conversation
   */
  closeConversation: async (conversationId) => {
    try {
      await api.patch(`/conversations/${conversationId}`, { isOpen: false });
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c._id === conversationId ? { ...c, isOpen: false } : c
        )
      }));
    } catch (error) {
      set({ error: error.response?.data?.error || error.message });
    }
  },

  /**
   * ค้นหา conversations
   */
  searchConversations: async (query, pageId) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get(`/conversations/search/${query}`, {
        params: { pageId, limit: 20 }
      });
      set({ conversations: response.data });
    } catch (error) {
      set({ error: error.response?.data?.error || error.message });
    } finally {
      set({ loading: false });
    }
  },

  // ============= Message Management =============

  /**
   * ดึง messages จาก conversation
   */
  fetchMessages: async (conversationId) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get(`/conversations/${conversationId}/messages`, {
        params: { limit: 50 }
      });

      const state = get();
      set({
        messages: {
          ...state.messages,
          [conversationId]: response.data.messages
        }
      });

      // Mark conversation as read
      set((prevState) => ({
        conversations: prevState.conversations.map((c) =>
          c._id === conversationId ? { ...c, unreadCount: 0 } : c
        ),
        unreadCounts: {
          ...prevState.unreadCounts,
          [conversationId]: 0
        }
      }));
    } catch (error) {
      set({ error: error.response?.data?.error || error.message });
    } finally {
      set({ loading: false });
    }
  },

  /**
   * ส่ง message ใหม่
   */
  sendMessage: async (conversationId, content) => {
    const state = get();
    if (!state.selectedPageId) {
      set({ error: 'No page selected' });
      return;
    }

    set({ loading: true, error: null });
    try {
      const response = await api.post(
        `/conversations/${conversationId}/messages`,
        {
          content,
          pageId: state.selectedPageId
        }
      );

      // Add message to local state
      const message = response.data.data;
      set((prevState) => ({
        messages: {
          ...prevState.messages,
          [conversationId]: [...(prevState.messages[conversationId] || []), message]
        }
      }));

      return message;
    } catch (error) {
      set({ error: error.response?.data?.error || error.message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // ============= Typing Indicators =============

  /**
   * Emit typing indicator
   */
  emitTyping: (conversationId, userName) => {
    const state = get();
    socketClient.sendTyping(conversationId, userName, state.selectedPageId);
  },

  /**
   * Stop typing indicator
   */
  stopTyping: (conversationId) => {
    const state = get();
    socketClient.stopTyping(conversationId, state.selectedPageId);
  },

  // ============= Socket.io Events Handlers =============

  /**
   * Register socket event listeners
   */
  registerSocketListeners: () => {
    // Message received from customer
    socketClient.on('message-received', (data) => {
      const { conversationId, message, conversation } = data;

      // Add message to state
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: [...(state.messages[conversationId] || []), message]
        }
      }));

      // Update conversation
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c._id === conversationId
            ? {
                ...c,
                lastMessage: conversation.lastMessage,
                lastMessageAt: conversation.lastMessageAt,
                unreadCount: c._id === state.selectedConversationId ? 0 : conversation.unreadCount
              }
            : c
        )
      }));

      // Play notification sound
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {
        // Muted or not available
      });
    });

    // Message sent confirmation
    socketClient.on('message-sent', (data) => {
      const { message } = data;
      console.log('Message sent:', message);
      // Update message status if needed
    });

    // User typing
    socketClient.on('user-typing', (data) => {
      const { conversationId, userName } = data;
      set((state) => ({
        typingUsers: {
          ...state.typingUsers,
          [conversationId]: userName
        }
      }));

      // Clear typing indicator after 3 seconds
      setTimeout(() => {
        set((state) => {
          const updated = { ...state.typingUsers };
          delete updated[conversationId];
          return { typingUsers: updated };
        });
      }, 3000);
    });

    // User stopped typing
    socketClient.on('user-stop-typing', (data) => {
      const { conversationId } = data;
      set((state) => {
        const updated = { ...state.typingUsers };
        delete updated[conversationId];
        return { typingUsers: updated };
      });
    });

    // Connection status
    socketClient.on('socket-connected', () => {
      set({ connectionStatus: 'connected' });
    });

    socketClient.on('socket-disconnected', () => {
      set({ connectionStatus: 'disconnected' });
    });
  },

  // ============= Utilities =============

  /**
   * Reset store
   */
  reset: () => {
    set({
      pages: [],
      selectedPageId: null,
      conversations: [],
      selectedConversationId: null,
      messages: {},
      loading: false,
      error: null,
      unreadCounts: {},
      typingUsers: {}
    });
  }
}));

export default useChatStore;
