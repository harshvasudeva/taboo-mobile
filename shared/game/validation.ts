import { MAX_ROOM_SIZE } from "../types/room";
import type { Room, RoomStatus } from "../types/room";
import type { PlayerId } from "../types/player";

/** Room-size guard shared by signaling server and host engine. */
export function canJoinRoom(room: Room): { ok: boolean; reason?: string } {
  if (room.players.length >= MAX_ROOM_SIZE) {
    return {
      ok: false,
      reason: `Room is full (max ${MAX_ROOM_SIZE} players)`,
    };
  }
  return { ok: true };
}

export function assertCanStart(
  room: Room,
  requesterId: PlayerId,
): { ok: boolean; reason?: string } {
  if (room.hostId !== requesterId) {
    return { ok: false, reason: "Only the host can start the game" };
  }
  const teamSizes = [0, 0];
  room.players.forEach((p) => {
    if (p.teamIndex === 0 || p.teamIndex === 1) teamSizes[p.teamIndex]++;
  });
  if (teamSizes[0] === 0 || teamSizes[1] === 0) {
    return { ok: false, reason: "Both teams need at least one player" };
  }
  return { ok: true };
}

export function transitionStatus(current: RoomStatus, next: RoomStatus): boolean {
  const allowed: Record<RoomStatus, RoomStatus[]> = {
    waiting: ["playing", "finished"],
    playing: ["finished", "waiting"],
    finished: ["waiting"],
  };
  return allowed[current].includes(next);
}
