import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

/**
 * Socket.io client singleton
 * ใช้ emit/on events ระหว่าง components
 */
class SocketClient {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(token, userId) {
    if (this.socket?.connected) return this.socket;

    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5002';

    this.socket = io(socketUrl, {
      auth: {
        token,
        userId
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      reconnectNow: true
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket.io connected:', this.socket.id);
      this.emit('socket-connected', { socketId: this.socket.id });
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Socket.io disconnected');
      this.emit('socket-disconnected', {});
    });

    this.socket.on('error', (error) => {
      console.error('⚠️  Socket.io error:', error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinPage(pageId) {
    if (this.socket?.connected) {
      this.socket.emit('join-page', { pageId });
    }
  }

  leavePage(pageId) {
    if (this.socket?.connected) {
      this.socket.emit('leave-page', { pageId });
    }
  }

  joinConversation(conversationId, pageId) {
    if (this.socket?.connected) {
      this.socket.emit('join-conversation', { conversationId, pageId });
    }
  }

  leaveConversation(conversationId) {
    if (this.socket?.connected) {
      this.socket.emit('leave-conversation', { conversationId });
    }
  }

  sendTyping(conversationId, userName, pageId) {
    if (this.socket?.connected) {
      this.socket.emit('typing', { conversationId, userName, pageId });
    }
  }

  stopTyping(conversationId, pageId) {
    if (this.socket?.connected) {
      this.socket.emit('stop-typing', { conversationId, pageId });
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    }

    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }
}

// Export singleton instance
export const socketClient = new SocketClient();

/**
 * Hook: useSocket
 * Manage socket connection and listeners
 */
export function useSocket(token, userId) {
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState(null);

  useEffect(() => {
    if (!token || !userId) return;

    // Connect to socket
    socketClient.connect(token, userId);

    const handleConnected = (data) => {
      setIsConnected(true);
      setSocketId(data.socketId);
    };

    const handleDisconnected = () => {
      setIsConnected(false);
      setSocketId(null);
    };

    socketClient.on('socket-connected', handleConnected);
    socketClient.on('socket-disconnected', handleDisconnected);

    return () => {
      socketClient.off('socket-connected', handleConnected);
      socketClient.off('socket-disconnected', handleDisconnected);
    };
  }, [token, userId]);

  return { isConnected, socketId };
}

export default socketClient;
