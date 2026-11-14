import {
  RoomPublicDto,
  RoomMemberPublicDto,
  CreateRoomInput,
  JoinRoomInput,
  ReadyStatusInput,
  UpdateRoomSettingsInput,
} from '@uno-ultimate/shared';
import { PlayerGameState, CardColor, GameWinner } from '@uno-ultimate/game-engine';
import { z } from 'zod';

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

  // Phase 4 & Phase 5 Gameplay Actions: Client to Server
  GAME_START: 'game:start',
  GAME_PLAY_CARD: 'game:play-card',
  GAME_DRAW_CARD: 'game:draw-card',
  GAME_PASS_TURN: 'game:pass-turn',
  GAME_CHOOSE_COLOR: 'game:choose-color',
  GAME_CHOOSE_STARTING_WILD_COLOR: 'game:choose-starting-wild-color',
  GAME_UNO: 'game:uno',
  GAME_CHALLENGE_UNO: 'game:challenge-uno',
  GAME_CHALLENGE_WILD_DRAW_FOUR: 'game:challenge-wild-draw-four',
  GAME_ACCEPT_WILD_DRAW_FOUR: 'game:accept-wild-draw-four',
  GAME_CHALLENGE_WILD_DRAW_TWO: 'game:challenge-wild-draw-two',
  GAME_ACCEPT_WILD_DRAW_TWO: 'game:accept-wild-draw-two',
  GAME_CHALLENGE_WILD_DRAW_COLOR: 'game:challenge-wild-draw-color',
  GAME_ACCEPT_WILD_DRAW_COLOR: 'game:accept-wild-draw-color',
  GAME_CHOOSE_7S_SWAP: 'game:choose-7s-swap',
  GAME_CHOOSE_ROULETTE_COLOR: 'game:choose-roulette-color',
  GAME_ACCEPT_STACK_PENALTY: 'game:accept-stack-penalty',
  GAME_CHOOSE_TARGETED_DRAW_TWO: 'game:choose-targeted-draw-two',
  GAME_CHOOSE_FORCED_SWAP: 'game:choose-forced-swap',
  GAME_NEXT_ROUND: 'game:next-round',

  // Phase 4 & Phase 6 Gameplay Broadcasts: Server to Client
  GAME_STARTED: 'game:started',
  GAME_STATE: 'game:state',
  GAME_ROUND_FINISHED: 'game:round-finished',
  GAME_FINISHED: 'game:finished',
  GAME_PLAYER_ELIMINATED: 'game:player-eliminated',
  GAME_ERROR: 'game:error',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

// Validation schemas for gameplay actions
export const playCardInputSchema = z.object({
  cardId: z.string().min(1, 'Card ID is required'),
  chosenColor: z.enum([
    'red',
    'yellow',
    'green',
    'blue',
    'pink',
    'teal',
    'orange',
    'purple',
  ]).optional(),
});
export type PlayCardInput = z.infer<typeof playCardInputSchema>;

export const challengeUnoInputSchema = z.object({
  targetPlayerId: z.string().min(1, 'Target player ID is required'),
});
export type ChallengeUnoInput = z.infer<typeof challengeUnoInputSchema>;

export const chooseColorInputSchema = z.object({
  chosenColor: z.enum([
    'red',
    'yellow',
    'green',
    'blue',
    'pink',
    'teal',
    'orange',
    'purple',
  ]),
});
export type ChooseColorInput = z.infer<typeof chooseColorInputSchema>;

export const choose7sSwapInputSchema = z.object({
  targetPlayerId: z.string().min(1, 'Target player ID is required'),
});
export type Choose7sSwapInput = z.infer<typeof choose7sSwapInputSchema>;

export const chooseRouletteColorInputSchema = z.object({
  chosenColor: z.enum(['red', 'yellow', 'green', 'blue']),
});
export type ChooseRouletteColorInput = z.infer<typeof chooseRouletteColorInputSchema>;

export const acceptStackPenaltyInputSchema = z.object({}).optional();
export type AcceptStackPenaltyInput = z.infer<typeof acceptStackPenaltyInputSchema>;

export const chooseTargetedDrawTwoInputSchema = z.object({
  targetPlayerId: z.string().min(1, 'Target player ID is required'),
});
export type ChooseTargetedDrawTwoInput = z.infer<typeof chooseTargetedDrawTwoInputSchema>;

export const chooseForcedSwapInputSchema = z.object({
  targetPlayerId: z.string().min(1, 'Target player ID is required'),
});
export type ChooseForcedSwapInput = z.infer<typeof chooseForcedSwapInputSchema>;

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

  // Gameplay operations
  [SOCKET_EVENTS.GAME_PLAY_CARD]: (
    payload: PlayCardInput,
    callback: (response: SocketAck<{ success: boolean; roundOver?: boolean; matchOver?: boolean }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_DRAW_CARD]: (
    payload: Record<string, never> | undefined,
    callback: (response: SocketAck<{ cardDrawn: boolean; cardId?: string }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_PASS_TURN]: (
    payload: Record<string, never> | undefined,
    callback: (response: SocketAck<{ passed: boolean }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_CHOOSE_COLOR]: (
    payload: { chosenColor: CardColor },
    callback: (response: SocketAck<{ success: boolean; chosenColor?: CardColor }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_CHOOSE_STARTING_WILD_COLOR]: (
    payload: { chosenColor: CardColor },
    callback: (response: SocketAck<{ success: boolean; chosenColor?: CardColor }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_UNO]: (
    payload: Record<string, never> | undefined,
    callback: (response: SocketAck<{ declared: boolean }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_CHALLENGE_UNO]: (
    payload: ChallengeUnoInput,
    callback: (response: SocketAck<{ success: boolean; penaltyCards: number }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_FOUR]: (
    payload: Record<string, never> | undefined,
    callback: (response: SocketAck<{ challengeWon: boolean; penaltyCards: number }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR]: (
    payload: Record<string, never> | undefined,
    callback: (response: SocketAck<{ accepted: boolean; cardsDrawn: number }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_TWO]: (
    payload: Record<string, never> | undefined,
    callback: (response: SocketAck<{ challengeWon: boolean; penaltyCards: number }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_TWO]: (
    payload: Record<string, never> | undefined,
    callback: (response: SocketAck<{ accepted: boolean; cardsDrawn: number }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_COLOR]: (
    payload: Record<string, never> | undefined,
    callback: (response: SocketAck<{ challengeWon: boolean; penaltyCards: number }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_COLOR]: (
    payload: Record<string, never> | undefined,
    callback: (response: SocketAck<{ accepted: boolean; cardsDrawn: number }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_CHOOSE_7S_SWAP]: (
    payload: Choose7sSwapInput,
    callback: (response: SocketAck<{ success: boolean; targetPlayerId: string }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_CHOOSE_ROULETTE_COLOR]: (
    payload: ChooseRouletteColorInput,
    callback: (response: SocketAck<{ success: boolean; cardsRevealed: number; eliminated: boolean }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_ACCEPT_STACK_PENALTY]: (
    payload: AcceptStackPenaltyInput,
    callback: (response: SocketAck<{ success: boolean; cardsDrawn: number; eliminated: boolean }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_CHOOSE_TARGETED_DRAW_TWO]: (
    payload: ChooseTargetedDrawTwoInput,
    callback: (response: SocketAck<{ success: boolean; targetPlayerId: string }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_CHOOSE_FORCED_SWAP]: (
    payload: ChooseForcedSwapInput,
    callback: (response: SocketAck<{ success: boolean; targetPlayerId: string }>) => void
  ) => void;
  [SOCKET_EVENTS.GAME_NEXT_ROUND]: (
    payload: Record<string, never> | undefined,
    callback: (response: SocketAck<{ started: boolean }>) => void
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

  // Gameplay broadcasts & personalized state delivery
  [SOCKET_EVENTS.GAME_STARTED]: (payload: { matchId: string; roomCode: string; roundNumber: number }) => void;
  [SOCKET_EVENTS.GAME_STATE]: (payload: { state: PlayerGameState }) => void;
  [SOCKET_EVENTS.GAME_ROUND_FINISHED]: (payload: { roundWinner: GameWinner; roundNumber: number; scores: Record<string, number> }) => void;
  [SOCKET_EVENTS.GAME_FINISHED]: (payload: { winner: GameWinner; finalScores: Record<string, number> }) => void;
  [SOCKET_EVENTS.GAME_PLAYER_ELIMINATED]: (payload: { guestId: string; username: string; cardCount: number; remainingPlayerCount: number }) => void;
  [SOCKET_EVENTS.GAME_ERROR]: (payload: { code: string; message: string }) => void;
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
