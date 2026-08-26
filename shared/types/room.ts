import type { Player, PlayerId } from "./player";

export const MAX_ROOM_SIZE = 8;

export type RoomStatus = "waiting" | "playing" | "finished";

export interface Room {
  id: string;
  hostId: PlayerId;
  players: Player[];
  status: RoomStatus;
  createdAt: number;
  lastActivityAt: number;
}

export function generateRoomId(): string {
  // 6 char uppercase alphanumeric (matches existing web app room code style).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function findPlayer(room: Room, playerId: PlayerId): Player | undefined {
  return room.players.find((p) => p.id === playerId);
}

export function roomIsFull(room: Room): boolean {
  return room.players.length >= MAX_ROOM_SIZE;
}
