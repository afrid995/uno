import { create } from 'zustand';
import {
  PlayerGameState,
  Card,
  CardColor,
  GameWinner,
  SOCKET_EVENTS,
} from '@uno-ultimate/game-protocol';
import { socketManager } from '../services/socketClient';

interface GameStateStore {
  gameState: PlayerGameState | null;
  isConnected: boolean;
  isActionLoading: boolean;
  error: string | null;
  selectedCardForWild: Card | null;
  showRoundResultModal: boolean;
  showMatchResultModal: boolean;
  roundWinnerData: GameWinner | null;
  matchWinnerData: GameWinner | null;
  roundScores: Record<string, number> | null;

  // Actions
  playCard: (cardId: string, chosenColor?: CardColor) => Promise<boolean>;
  drawCard: () => Promise<boolean>;
  passTurn: () => Promise<boolean>;
  callUno: () => Promise<boolean>;
  challengeUno: (targetPlayerId: string) => Promise<boolean>;
  challengeWildDrawFour: () => Promise<boolean>;
  acceptWildDrawFour: () => Promise<boolean>;
  challengeWildDrawTwo: () => Promise<boolean>;
  acceptWildDrawTwo: () => Promise<boolean>;
  challengeWildDrawColor: () => Promise<boolean>;
  acceptWildDrawColor: () => Promise<boolean>;
  chooseStartingWildColor: (chosenColor: CardColor) => Promise<boolean>;
  choose7sSwap: (targetPlayerId: string) => Promise<boolean>;
  chooseRouletteColor: (chosenColor: 'red' | 'yellow' | 'green' | 'blue') => Promise<boolean>;
  acceptStackPenalty: () => Promise<boolean>;
  chooseTargetedDrawTwo: (targetPlayerId: string) => Promise<boolean>;
  chooseForcedSwap: (targetPlayerId: string) => Promise<boolean>;
  startNextRound: () => Promise<boolean>;

  openWildColorPicker: (card: Card) => void;
  closeWildColorPicker: () => void;
  dismissRoundModal: () => void;
  clearError: () => void;
  initGameListeners: (roomCode: string) => () => void;
}

export const useGameStore = create<GameStateStore>((set) => ({
  gameState: null,
  isConnected: true,
  isActionLoading: false,
  error: null,
  selectedCardForWild: null,
  showRoundResultModal: false,
  showMatchResultModal: false,
  roundWinnerData: null,
  matchWinnerData: null,
  roundScores: null,

  openWildColorPicker: (card) => set({ selectedCardForWild: card }),
  closeWildColorPicker: () => set({ selectedCardForWild: null }),
  dismissRoundModal: () => set({ showRoundResultModal: false }),
  clearError: () => set({ error: null }),

  playCard: async (cardId, chosenColor) => {
    set({ isActionLoading: true, error: null, selectedCardForWild: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(
        SOCKET_EVENTS.GAME_PLAY_CARD,
        { cardId, chosenColor },
        (res) => {
          set({ isActionLoading: false });
          if (res.success) {
            resolve(true);
          } else {
            set({ error: res.error?.message || 'Failed to play card' });
            resolve(false);
          }
        }
      );
    });
  },

  drawCard: async () => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_DRAW_CARD, {}, (res) => {
        set({ isActionLoading: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to draw card' });
          resolve(false);
        }
      });
    });
  },

  passTurn: async () => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_PASS_TURN, {}, (res) => {
        set({ isActionLoading: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to pass turn' });
          resolve(false);
        }
      });
    });
  },

  callUno: async () => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_UNO, {}, (res) => {
        set({ isActionLoading: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to declare UNO' });
          resolve(false);
        }
      });
    });
  },

  challengeUno: async (targetPlayerId) => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(
        SOCKET_EVENTS.GAME_CHALLENGE_UNO,
        { targetPlayerId },
        (res) => {
          set({ isActionLoading: false });
          if (res.success) {
            resolve(true);
          } else {
            set({ error: res.error?.message || 'UNO challenge failed' });
            resolve(false);
          }
        }
      );
    });
  },

  challengeWildDrawFour: async () => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_FOUR, {}, (res) => {
        set({ isActionLoading: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to challenge Wild Draw Four' });
          resolve(false);
        }
      });
    });
  },

  acceptWildDrawFour: async () => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, (res) => {
        set({ isActionLoading: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to accept Wild Draw Four' });
          resolve(false);
        }
      });
    });
  },

  challengeWildDrawTwo: async () => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_TWO, {}, (res) => {
        set({ isActionLoading: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to challenge Wild Draw Two' });
          resolve(false);
        }
      });
    });
  },

  acceptWildDrawTwo: async () => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_TWO, {}, (res) => {
        set({ isActionLoading: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to accept Wild Draw Two' });
          resolve(false);
        }
      });
    });
  },

  challengeWildDrawColor: async () => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_COLOR, {}, (res) => {
        set({ isActionLoading: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to challenge Wild Draw Color' });
          resolve(false);
        }
      });
    });
  },

  acceptWildDrawColor: async () => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_COLOR, {}, (res) => {
        set({ isActionLoading: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to accept Wild Draw Color' });
          resolve(false);
        }
      });
    });
  },

  chooseStartingWildColor: async (chosenColor: CardColor) => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_CHOOSE_STARTING_WILD_COLOR, { chosenColor }, (res) => {
        set({ isActionLoading: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to choose starting color' });
          resolve(false);
        }
      });
    });
  },

  choose7sSwap: async (targetPlayerId: string) => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_CHOOSE_7S_SWAP, { targetPlayerId }, (res) => {
        set({ isActionLoading: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to swap hands' });
          resolve(false);
        }
      });
    });
  },

  chooseRouletteColor: async (chosenColor: 'red' | 'yellow' | 'green' | 'blue') => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_CHOOSE_ROULETTE_COLOR, { chosenColor }, (res) => {
        set({ isActionLoading: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to choose roulette color' });
          resolve(false);
        }
      });
    });
  },

  acceptStackPenalty: async () => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_ACCEPT_STACK_PENALTY, {}, (res) => {
        set({ isActionLoading: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to accept stack penalty' });
          resolve(false);
        }
      });
    });
  },

  chooseTargetedDrawTwo: async (targetPlayerId: string) => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_CHOOSE_TARGETED_DRAW_TWO, { targetPlayerId }, (res) => {
        set({ isActionLoading: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to target player' });
          resolve(false);
        }
      });
    });
  },

  chooseForcedSwap: async (targetPlayerId: string) => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_CHOOSE_FORCED_SWAP, { targetPlayerId }, (res) => {
        set({ isActionLoading: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to swap hands' });
          resolve(false);
        }
      });
    });
  },

  startNextRound: async () => {
    set({ isActionLoading: true, error: null });
    const socket = socketManager.getSocket();

    return new Promise<boolean>((resolve) => {
      socket.emit(SOCKET_EVENTS.GAME_NEXT_ROUND, {}, (res) => {
        set({ isActionLoading: false, showRoundResultModal: false });
        if (res.success) {
          resolve(true);
        } else {
          set({ error: res.error?.message || 'Failed to start next round' });
          resolve(false);
        }
      });
    });
  },

  initGameListeners: (roomCode: string) => {
    const socket = socketManager.getSocket();

    const handleGameState = (payload: { state: PlayerGameState }) => {
      set({ gameState: payload.state });

      if (payload.state.status === 'ROUND_OVER') {
        set({
          showRoundResultModal: true,
          roundWinnerData: payload.state.roundWinner,
        });
      } else if (payload.state.status === 'COMPLETED') {
        set({
          showMatchResultModal: true,
          matchWinnerData: payload.state.winner,
        });
      }
    };

    const handleRoundFinished = (payload: {
      roundWinner: GameWinner;
      roundNumber: number;
      scores: Record<string, number>;
    }) => {
      set({
        showRoundResultModal: true,
        roundWinnerData: payload.roundWinner,
        roundScores: payload.scores,
      });
    };

    const handleGameFinished = (payload: {
      winner: GameWinner;
      finalScores: Record<string, number>;
    }) => {
      set({
        showMatchResultModal: true,
        matchWinnerData: payload.winner,
        roundScores: payload.finalScores,
      });
    };

    const handleGameError = (payload: { code: string; message: string }) => {
      set({ error: payload.message });
    };

    socket.on(SOCKET_EVENTS.GAME_STATE, handleGameState);
    socket.on(SOCKET_EVENTS.GAME_ROUND_FINISHED, handleRoundFinished);
    socket.on(SOCKET_EVENTS.GAME_FINISHED, handleGameFinished);
    socket.on(SOCKET_EVENTS.GAME_ERROR, handleGameError);

    // Request initial state or resume
    socket.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, () => {});

    return () => {
      socket.off(SOCKET_EVENTS.GAME_STATE, handleGameState);
      socket.off(SOCKET_EVENTS.GAME_ROUND_FINISHED, handleRoundFinished);
      socket.off(SOCKET_EVENTS.GAME_FINISHED, handleGameFinished);
      socket.off(SOCKET_EVENTS.GAME_ERROR, handleGameError);
    };
  },
}));
