import {
  RoomPublicDto,
  RoomMemberPublicDto,
  CreateRoomInput,
  JoinRoomInput,
  ReadyStatusInput,
  UpdateRoomSettingsInput,
} from '@uno-ultimate/shared';

export interface SocketAck<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export const SOCKET_EVENTS = {
  // Phase 1 Foundational Connection & Authentication
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',
  AUTH_AUTHENTICATE: 'auth:authenticate',
  AUTH_SUCCESS: 'auth:success',
  AUTH_ERROR: 'auth:error',
  PING: 'ping',
  PONG: 'pong',

  // Phase 2 Room Events: Client to Server
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_JOIN_LINK: 'room:join-link',
  ROOM_LEAVE: 'room:leave',
  ROOM_READY: 'room:ready',
  ROOM_UPDATE_SETTINGS: 'room:update-settings',
  ROOM_START: 'room:start',
  ROOM_RESUME: 'room:resume',

  // Phase 2 Room Events: Server to Client Broadcasts
  ROOM_CREATED: 'room:created',
  ROOM_JOINED: 'room:joined',
  ROOM_STATE: 'room:state',
  ROOM_PLAYER_JOINED: 'room:player-joined',
  ROOM_PLAYER_LEFT: 'room:player-left',
  ROOM_PLAYER_READY: 'room:player-ready',
  ROOM_HOST_CHANGED: 'room:host-changed',
  ROOM_ERROR: 'room:error',
  ROOM_CLOSED: 'room:closed',
  ROOM_STARTING: 'room:starting',

  // Phase 3+ Gameplay Actions
  GAME_START: 'game:start',
  GAME_PLAY_CARD: 'game:play_card',
  GAME_DRAW_CARD: 'game:draw_card',
  GAME_CALL_UNO: 'game:call_uno',
  GAME_STATE_SYNC: 'game:state_sync',
  GAME_OVER: 'game:over',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/**
 * Socket.IO client-to-server event signatures
 */
export interface ClientToServerEvents {
  [SOCKET_EVENTS.AUTH_AUTHENTICATE]: (
    payload: { sessionToken: string },
    callback: (response: SocketAck<{ guestId: string; username: string }>) => void
  ) => void;
  [SOCKET_EVENTS.PING]: () => void;

  // Room operations
  [SOCKET_EVENTS.ROOM_CREATE]: (
    payload: CreateRoomInput,
    callback: (response: SocketAck<RoomPublicDto>) => void
  ) => void;
  [SOCKET_EVENTS.ROOM_JOIN]: (
    payload: JoinRoomInput,
    callback: (response: SocketAck<RoomPublicDto>) => void
  ) => void;
  [SOCKET_EVENTS.ROOM_JOIN_LINK]: (
    payload: JoinRoomInput,
    callback: (response: SocketAck<RoomPublicDto>) => void
  ) => void;
  [SOCKET_EVENTS.ROOM_LEAVE]: (
    payload: Record<string, never> | undefined,
    callback: (response: SocketAck<{ left: boolean }>) => void
  ) => void;
  [SOCKET_EVENTS.ROOM_READY]: (
    payload: ReadyStatusInput,
    callback: (response: SocketAck<{ readyStatus: boolean }>) => void
  ) => void;
  [SOCKET_EVENTS.ROOM_UPDATE_SETTINGS]: (
    payload: UpdateRoomSettingsInput,
    callback: (response: SocketAck<Record<string, unknown>>) => void
  ) => void;
  [SOCKET_EVENTS.ROOM_START]: (
    payload: Record<string, never> | undefined,
    callback: (response: SocketAck<{ starting: boolean }>) => void
  ) => void;
  [SOCKET_EVENTS.ROOM_RESUME]: (
    payload: JoinRoomInput,
    callback: (response: SocketAck<RoomPublicDto>) => void
  ) => void;
}

/**
 * Socket.IO server-to-client event signatures
 */
export interface ServerToClientEvents {
  [SOCKET_EVENTS.AUTH_SUCCESS]: (payload: { guestId: string; username: string }) => void;
  [SOCKET_EVENTS.AUTH_ERROR]: (payload: { message: string; code: string }) => void;
  [SOCKET_EVENTS.PONG]: (payload: { timestamp: number }) => void;

  // Room broadcasts
  [SOCKET_EVENTS.ROOM_CREATED]: (payload: { room: RoomPublicDto }) => void;
  [SOCKET_EVENTS.ROOM_JOINED]: (payload: { room: RoomPublicDto }) => void;
  [SOCKET_EVENTS.ROOM_STATE]: (payload: { room: RoomPublicDto }) => void;
  [SOCKET_EVENTS.ROOM_PLAYER_JOINED]: (payload: { player: RoomMemberPublicDto; version: number }) => void;
  [SOCKET_EVENTS.ROOM_PLAYER_LEFT]: (payload: { guestId: string; newHostGuestId?: string; version: number }) => void;
  [SOCKET_EVENTS.ROOM_PLAYER_READY]: (payload: { guestId: string; isReady: boolean; version: number }) => void;
  [SOCKET_EVENTS.ROOM_HOST_CHANGED]: (payload: { newHostGuestId: string; version: number }) => void;
  [SOCKET_EVENTS.ROOM_ERROR]: (payload: { code: string; message: string }) => void;
  [SOCKET_EVENTS.ROOM_CLOSED]: (payload: { reason: string }) => void;
  [SOCKET_EVENTS.ROOM_STARTING]: (payload: { countdownSeconds: number; version: number }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  guestId?: string;
  username?: string;
  isAuthenticated: boolean;
  currentRoomCode?: string;
}
