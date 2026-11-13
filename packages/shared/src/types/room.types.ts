import { z } from 'zod';
import {
  createRoomSchema,
  joinRoomSchema,
  readyStatusSchema,
  updateRoomSettingsSchema,
  roomMemberPublicDtoSchema,
  roomPublicDtoSchema,
  roomMemberRoleEnum,
  connectionStatusEnum,
  roomStatusEnum,
} from '../schemas/room.schema';

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type ReadyStatusInput = z.infer<typeof readyStatusSchema>;
export type UpdateRoomSettingsInput = z.infer<typeof updateRoomSettingsSchema>;

export type RoomMemberRole = z.infer<typeof roomMemberRoleEnum>;
export type ConnectionStatus = z.infer<typeof connectionStatusEnum>;
export type RoomStatus = z.infer<typeof roomStatusEnum>;

export type RoomMemberPublicDto = z.infer<typeof roomMemberPublicDtoSchema>;
export type RoomPublicDto = z.infer<typeof roomPublicDtoSchema>;

export interface RoomMetadataResponse {
  exists: boolean;
  roomCode?: string;
  status?: RoomStatus;
  playerCount?: number;
  maxPlayers?: number;
  isFull?: boolean;
  isExpired?: boolean;
  error?: string;
}
