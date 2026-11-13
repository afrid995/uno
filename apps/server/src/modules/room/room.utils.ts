import crypto from 'crypto';
import { ROOM_RULES } from '@uno-ultimate/shared';

/**
 * Generates a cryptographically secure 6-character room code from the unambiguous alphabet.
 */
export function generateRoomCode(): string {
  const chars = ROOM_RULES.CODE_ALPHABET;
  const length = ROOM_RULES.CODE_LENGTH;
  let result = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    result += chars[randomIndex];
  }

  return result;
}
