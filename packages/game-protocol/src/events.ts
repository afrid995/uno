/**
 * Foundation socket events and contract for UNO Ultimate.
 * In Phase 1, only foundational connection/auth events are active.
 * Room and gameplay events are modeled here as design specifications for Phase 2+.
 */

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

  // Phase 2 Room Lifecycle (Architectural Specification)
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_UPDATED: 'room:updated',
  ROOM_PLAYER_JOINED: 'room:player_joined',
  ROOM_PLAYER_LEFT: 'room:player_left',
  ROOM_ERROR: 'room:error',

  // Phase 3+ Gameplay Actions (Server-Authoritative)
  GAME_START: 'game:start',
  GAME_PLAY_CARD: 'game:play_card',
  GAME_DRAW_CARD: 'game:draw_card',
  GAME_CALL_UNO: 'game:call_uno',
  GAME_STATE_SYNC: 'game:state_sync',
  GAME_OVER: 'game:over',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/**
 * Socket.IO typing interfaces for type safety
 */
export interface ClientToServerEvents {
  [SOCKET_EVENTS.AUTH_AUTHENTICATE]: (payload: { sessionToken: string }, callback: (response: { success: boolean; error?: string }) => void) => void;
  [SOCKET_EVENTS.PING]: () => void;
}

export interface ServerToClientEvents {
  [SOCKET_EVENTS.AUTH_SUCCESS]: (payload: { guestId: string; username: string }) => void;
  [SOCKET_EVENTS.AUTH_ERROR]: (payload: { message: string; code: string }) => void;
  [SOCKET_EVENTS.PONG]: (payload: { timestamp: number }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  guestId?: string;
  username?: string;
  isAuthenticated: boolean;
}
