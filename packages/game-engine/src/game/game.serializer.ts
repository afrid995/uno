import { GameState } from './game.types';

export class GameSerializer {
  /**
   * Serializes a GameState to a JSON string.
   */
  static serialize(state: GameState): string {
    return JSON.stringify(state);
  }

  /**
   * Deserializes a JSON string back into a strongly typed GameState.
   * Performs basic structural integrity validation.
   */
  static deserialize(jsonString: string): GameState {
    const parsed = JSON.parse(jsonString) as GameState;

    if (!parsed.id || !parsed.roomId || !Array.isArray(parsed.players) || !Array.isArray(parsed.drawPile)) {
      throw new Error('Invalid serialized GameState structure.');
    }

    return parsed;
  }
}
