import { GameState } from '../../game/game.types';

export function getTeamIdForSeat(seatIndex: number, totalPlayers: number): string {
  const teamCount = Math.floor(totalPlayers / 2);
  const teamNum = (seatIndex % teamCount) + 1;
  return `team_${teamNum}`;
}

export function getPartnerSeatIndex(seatIndex: number, totalPlayers: number): number {
  const teamCount = Math.floor(totalPlayers / 2);
  return (seatIndex + teamCount) % totalPlayers;
}

export function getPartnerId(playerId: string, state: GameState): string {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || !player.teamId) {
    // Fallback to seating order
    const seatIdx = state.playerOrder.indexOf(playerId);
    if (seatIdx !== -1) {
      const partnerIdx = getPartnerSeatIndex(seatIdx, state.playerOrder.length);
      return state.playerOrder[partnerIdx];
    }
    throw new Error(`Player ${playerId} has no team assignment in state.`);
  }

  const partner = state.players.find((p) => p.teamId === player.teamId && p.id !== playerId);
  if (!partner) {
    throw new Error(`Teammate for player ${playerId} (team: ${player.teamId}) not found.`);
  }
  return partner.id;
}
