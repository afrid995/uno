import { create } from 'zustand';
import {
  SOCKET_EVENTS,
  ChatMessageDto,
  ChatHistoryDto,
  SocketAck,
} from '@uno-ultimate/game-protocol';
import { socketManager } from '../services/socketClient';

interface ChatState {
  messages: ChatMessageDto[];
  isOpen: boolean;
  unreadCount: number;
  isLoadingHistory: boolean;
  isSending: boolean;
  error: string | null;

  setIsOpen: (isOpen: boolean) => void;
  toggleChat: () => void;
  sendMessage: (message: string) => Promise<boolean>;
  fetchHistory: () => Promise<void>;
  addMessage: (message: ChatMessageDto) => void;
  clearError: () => void;
  initChatListeners: (roomCode: string) => () => void;
  reset: () => void;
}

const initialState = {
  messages: [] as ChatMessageDto[],
  isOpen: false,
  unreadCount: 0,
  isLoadingHistory: false,
  isSending: false,
  error: null,
};

export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,

  setIsOpen: (isOpen: boolean) => {
    set({
      isOpen,
      unreadCount: isOpen ? 0 : get().unreadCount,
    });
  },

  toggleChat: () => {
    const nextIsOpen = !get().isOpen;
    set({
      isOpen: nextIsOpen,
      unreadCount: nextIsOpen ? 0 : get().unreadCount,
    });
  },

  clearError: () => set({ error: null }),

  sendMessage: async (messageText: string) => {
    const trimmed = messageText.trim();
    if (!trimmed || get().isSending) return false;

    set({ isSending: true, error: null });
    const socket = socketManager.getSocket();

    try {
      const ack = await new Promise<SocketAck<ChatMessageDto>>((resolve) => {
        socket.emit(
          SOCKET_EVENTS.ROOM_CHAT_SEND,
          { message: trimmed },
          (res: SocketAck<ChatMessageDto>) => resolve(res)
        );
      });

      if (!ack.success) {
        set({
          isSending: false,
          error: ack.error?.message || 'Failed to send message',
        });
        return false;
      }

      set({ isSending: false });
      return true;
    } catch (err: unknown) {
      set({
        isSending: false,
        error: (err as Error).message || 'Failed to send message',
      });
      return false;
    }
  },

  fetchHistory: async () => {
    set({ isLoadingHistory: true, error: null });
    const socket = socketManager.getSocket();

    try {
      const ack = await new Promise<SocketAck<ChatHistoryDto>>((resolve) => {
        socket.emit(
          SOCKET_EVENTS.ROOM_CHAT_GET_HISTORY,
          {},
          (res: SocketAck<ChatHistoryDto>) => resolve(res)
        );
      });

      if (ack.success && ack.data) {
        set({
          messages: ack.data.messages,
          isLoadingHistory: false,
        });
      } else {
        set({ isLoadingHistory: false });
      }
    } catch {
      set({ isLoadingHistory: false });
    }
  },

  addMessage: (message: ChatMessageDto) => {
    set((state) => {
      // Prevent duplicates by ID
      if (state.messages.some((m) => m.id === message.id)) {
        return state;
      }
      return {
        messages: [...state.messages, message],
        unreadCount: state.isOpen ? 0 : state.unreadCount + 1,
      };
    });
  },

  initChatListeners: (_roomCode: string) => {
    const socket = socketManager.getSocket();

    const handleChatMessage = (payload: ChatMessageDto) => {
      get().addMessage(payload);
    };

    const handleChatHistory = (payload: ChatHistoryDto) => {
      set({ messages: payload.messages });
    };

    socket.on(SOCKET_EVENTS.ROOM_CHAT_MESSAGE, handleChatMessage);
    socket.on(SOCKET_EVENTS.ROOM_CHAT_HISTORY, handleChatHistory);

    // Initial history fetch
    get().fetchHistory();

    return () => {
      socket.off(SOCKET_EVENTS.ROOM_CHAT_MESSAGE, handleChatMessage);
      socket.off(SOCKET_EVENTS.ROOM_CHAT_HISTORY, handleChatHistory);
    };
  },

  reset: () => {
    set(initialState);
  },
}));
