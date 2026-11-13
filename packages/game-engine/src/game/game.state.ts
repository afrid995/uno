import { GameState } from './game.types';
import { GameAction, GameEventRecord } from '../actions/action.types';
import { ActionProcessor } from '../actions/action.processor';
import { GameSerializer } from './game.serializer';
import { PublicGameState, getPublicGameState } from '../projections/public-state';
import { PlayerGameState, getPlayerGameState } from '../projections/player-state';
import { RandomNumberGenerator, defaultCryptoRng } from '../deck/deck.shuffle';

export class GameEngine {
  private currentState: GameState;

  constructor(initialState: GameState) {
    this.currentState = initialState;
  }

  /**
   * Returns current internal game state.
   */
  getState(): GameState {
    return this.currentState;
  }

  /**
   * Dispatches a game action, validating and transitioning state immutably.
   */
  dispatch(
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): { nextState: GameState; events: readonly GameEventRecord[] } {
    const { nextState, events } = ActionProcessor.process(this.currentState, action, rng);
    this.currentState = nextState;
    return { nextState, events };
  }

  /**
   * Generates public view of the match (opponent hands concealed).
   */
  getPublicState(): PublicGameState {
    return getPublicGameState(this.currentState);
  }

  /**
   * Generates sanitized player view containing public state and own hand only.
   */
  getPlayerState(playerId: string): PlayerGameState {
    return getPlayerGameState(this.currentState, playerId);
  }

  /**
   * Serializes current state to JSON string.
   */
  serialize(): string {
    return GameSerializer.serialize(this.currentState);
  }

  /**
   * Deserializes JSON string into a new GameEngine instance.
   */
  static deserialize(jsonString: string): GameEngine {
    const state = GameSerializer.deserialize(jsonString);
    return new GameEngine(state);
  }
}
