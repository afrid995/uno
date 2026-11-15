import { z } from 'zod';
import { ROOM_RULES } from '../constants';

export const roomCodeSchema = z
  .string()
  .transform((val) => val.trim().toUpperCase())
  .pipe(
    z
      .string()
      .length(ROOM_RULES.CODE_LENGTH, {
        message: `Room code must be exactly ${ROOM_RULES.CODE_LENGTH} characters.`,
      })
      .regex(ROOM_RULES.CODE_PATTERN, {
        message: 'Room code contains invalid characters.',
      })
  );

export const roomSettingsSchema = z.object({
  variant: z.enum(['classic', 'uno_flip', 'uno_show_em_no_mercy', 'uno_all_wild', 'uno_flex', 'uno_teams', 'uno_attack']).default('classic'),
}).passthrough();
export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export const createRoomSchema = z.object({
  maxPlayers: z
    .number()
    .int()
    .min(ROOM_RULES.MIN_PLAYERS, {
      message: `Minimum ${ROOM_RULES.MIN_PLAYERS} players required.`,
    })
    .max(ROOM_RULES.MAX_PLAYERS, {
      message: `Maximum ${ROOM_RULES.MAX_PLAYERS} players allowed.`,
    })
    .default(ROOM_RULES.DEFAULT_MAX_PLAYERS)
    .optional(),
  settings: roomSettingsSchema.default({ variant: 'classic' }).optional(),
});

export const joinRoomSchema = z.object({
  roomCode: roomCodeSchema,
});

export const readyStatusSchema = z.object({
  isReady: z.boolean(),
});

export const updateRoomSettingsSchema = z.object({
  settings: z.record(z.unknown()),
});

export const roomMemberRoleEnum = z.enum(['HOST', 'PLAYER']);
export const connectionStatusEnum = z.enum(['CONNECTED', 'DISCONNECTED']);
export const roomStatusEnum = z.enum(['WAITING', 'STARTING', 'IN_GAME', 'FINISHED']);

export const roomMemberPublicDtoSchema = z.object({
  id: z.string().uuid(),
  guestId: z.string().uuid(),
  username: z.string(),
  role: roomMemberRoleEnum,
  readyStatus: z.boolean(),
  connectionStatus: connectionStatusEnum,
  joinedAt: z.string(),
  lastSeenAt: z.string(),
});

export const roomPublicDtoSchema = z.object({
  id: z.string().uuid(),
  roomCode: z.string(),
  hostGuestId: z.string().uuid(),
  status: roomStatusEnum,
  maxPlayers: z.number().int(),
  playerCount: z.number().int(),
  members: z.array(roomMemberPublicDtoSchema),
  settings: z.record(z.unknown()),
  version: z.number().int(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
