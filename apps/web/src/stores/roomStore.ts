import { create } from 'zustand';
import {
  RoomPublicDto,
  RoomMemberPublicDto,
  CreateRoomInput,
  JoinRoomInput,
  SOCKET_EVENTS,
} from '@uno-ultimate/game-protocol';
import { socketManager } from '../services/socketClient';

interface RoomState {
  room: RoomPublicDto | null;
  isLoading: boolean;
  error: string | null;
  startingCountdown: number | null;
  isStarting: boolean;

  // Actions
  createRoom: (input?: CreateRoomInput) => Promise<boolean>;
  joinRoom: (input: JoinRoomInput) => Promise<boolean>;
  leaveRoom: () => Promise<boolean>;
  toggleReady: () => Promise<boolean>;
  updateSettings: (settings: Record<string, unknown>) => Promise<boolean>;
  startGame: () => Promise<boolean>;
  setRoom: (room: RoomPublicDto | null) => void;
  clearError: () => void;
  initSocketListeners: () => () => void;
}

export const useRoomStore = create<RoomState>((set, get) => ({
  room: null,
  isLoading: false,
  error: null,
  startingCountdown: null,
  isStarting: false,

  setRoom: (room) => set({ room }),
  clearError: () => set({ error: null }),

  createRoom: async (input) => {
    set({ isLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.ROOM_CREATE, input || {}, (res) => {
        if (res.success && res.data) {
          set({ room: res.data, isLoading: false, error: null });
          resolve(true);
        } else {
          set({
            isLoading: false,
            error: res.error?.message || 'Failed to create room.',
          });
          resolve(false);
        }
      });
    });
  },

  joinRoom: async (input) => {
    set({ isLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.ROOM_JOIN, input, (res) => {
        if (res.success && res.data) {
          set({ room: res.data, isLoading: false, error: null });
          resolve(true);
        } else {
          set({
            isLoading: false,
            error: res.error?.message || 'Failed to join room.',
          });
          resolve(false);
        }
      });
    });
  },

  leaveRoom: async () => {
    set({ isLoading: true });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, (res) => {
        set({ room: null, isLoading: false, isStarting: false, startingCountdown: null });
        resolve(res.success);
      });
    });
  },

  toggleReady: async () => {
    const currentRoom = get().room;
    if (!currentRoom) return false;

    const socket = socketManager.getSocket();
    const currentMember = currentRoom.members.find(
      (m: RoomMemberPublicDto) => m.guestId === (socket.auth as { token?: string })?.token
    );
    const newReadyState = !currentMember?.readyStatus;

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: newReadyState }, (res) => {
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to update ready status' });
          resolve(false);
        }
      });
    });
  },

  updateSettings: async (settings) => {
    const socket = socketManager.getSocket();
    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.ROOM_UPDATE_SETTINGS, { settings }, (res) => {
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to update settings' });
          resolve(false);
        }
      });
    });
  },

  startGame: async () => {
    const socket = socketManager.getSocket();
    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.ROOM_START, undefined, (res) => {
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Cannot start match yet.' });
          resolve(false);
        }
      });
    });
  },

  initSocketListeners: () => {
    const socket = socketManager.getSocket();

    const handleRoomState = (payload: { room: RoomPublicDto }) => {
      const current = get().room;
      if (!current || payload.room.version >= current.version) {
        set({ room: payload.room });
      }
    };

    const handlePlayerJoined = (_payload: { player: RoomMemberPublicDto; version: number }) => {
      // room:state broadcast will sync the complete updated state
    };

    const handlePlayerLeft = (payload: { guestId: string; newHostGuestId?: string; version: number }) => {
      const current = get().room;
      if (current) {
        const updatedMembers = current.members.filter((m: RoomMemberPublicDto) => m.guestId !== payload.guestId);
        if (payload.newHostGuestId) {
          updatedMembers.forEach((m: RoomMemberPublicDto) => {
            if (m.guestId === payload.newHostGuestId) m.role = 'HOST';
          });
        }
        set({
          room: {
            ...current,
            hostGuestId: payload.newHostGuestId || current.hostGuestId,
            members: updatedMembers,
            playerCount: updatedMembers.length,
            version: payload.version,
          },
        });
      }
    };

    const handlePlayerReady = (payload: { guestId: string; isReady: boolean; version: number }) => {
      const current = get().room;
      if (current) {
        const updatedMembers = current.members.map((m: RoomMemberPublicDto) =>
          m.guestId === payload.guestId ? { ...m, readyStatus: payload.isReady } : m
        );
        set({
          room: {
            ...current,
            members: updatedMembers,
            version: payload.version,
          },
        });
      }
    };

    const handleHostChanged = (payload: { newHostGuestId: string; version: number }) => {
      const current = get().room;
      if (current) {
        const updatedMembers = current.members.map((m: RoomMemberPublicDto) => ({
          ...m,
          role: m.guestId === payload.newHostGuestId ? ('HOST' as const) : ('PLAYER' as const),
        }));
        set({
          room: {
            ...current,
            hostGuestId: payload.newHostGuestId,
            members: updatedMembers,
            version: payload.version,
          },
        });
      }
    };

    const handleRoomClosed = (payload: { reason: string }) => {
      set({
        room: null,
        error: `Room closed: ${payload.reason}`,
      });
    };

    const handleRoomStarting = (payload: { countdownSeconds: number }) => {
      set({
        isStarting: true,
        startingCountdown: payload.countdownSeconds,
      });
    };

    const handleRoomError = (payload: { code: string; message: string }) => {
      set({ error: payload.message });
    };

    socket.on(SOCKET_EVENTS.ROOM_STATE, handleRoomState);
    socket.on(SOCKET_EVENTS.ROOM_PLAYER_JOINED, handlePlayerJoined);
    socket.on(SOCKET_EVENTS.ROOM_PLAYER_LEFT, handlePlayerLeft);
    socket.on(SOCKET_EVENTS.ROOM_PLAYER_READY, handlePlayerReady);
    socket.on(SOCKET_EVENTS.ROOM_HOST_CHANGED, handleHostChanged);
    socket.on(SOCKET_EVENTS.ROOM_CLOSED, handleRoomClosed);
    socket.on(SOCKET_EVENTS.ROOM_STARTING, handleRoomStarting);
    socket.on(SOCKET_EVENTS.ROOM_ERROR, handleRoomError);

    // Return cleanup function
    return () => {
      socket.off(SOCKET_EVENTS.ROOM_STATE, handleRoomState);
      socket.off(SOCKET_EVENTS.ROOM_PLAYER_JOINED, handlePlayerJoined);
      socket.off(SOCKET_EVENTS.ROOM_PLAYER_LEFT, handlePlayerLeft);
      socket.off(SOCKET_EVENTS.ROOM_PLAYER_READY, handlePlayerReady);
      socket.off(SOCKET_EVENTS.ROOM_HOST_CHANGED, handleHostChanged);
      socket.off(SOCKET_EVENTS.ROOM_CLOSED, handleRoomClosed);
      socket.off(SOCKET_EVENTS.ROOM_STARTING, handleRoomStarting);
      socket.off(SOCKET_EVENTS.ROOM_ERROR, handleRoomError);
    };
  },
}));
