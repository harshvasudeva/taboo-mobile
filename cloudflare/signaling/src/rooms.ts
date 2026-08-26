/**
 * In-memory room registry with aggressive TTL cleanup.
 * No persistent data: when WebRTC connects, signaling state becomes garbage.
 */
import type { PlayerId } from "../../../shared/types/player";
import { MAX_ROOM_SIZE } from "../../../shared/types/room";
import type {
  Session,
  SignalingRoom,
} from "./types";
import { ROOM_TTL_MS, rooms, sessions } from "./types";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomId(rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return out;
}

export function getRoom(id: string): SignalingRoom | undefined {
  return rooms().get(id);
}

export function createRoom(hostSession: Omit<Session, "roomId">): SignalingRoom {
  // Collision-proof enough at this scale; retry on clash.
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = generateRoomId();
    if (rooms().has(id)) continue;
    const room: SignalingRoom = {
      id,
      hostId: hostSession.playerId,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      players: new Map(),
    };
    room.players.set(hostSession.playerId, { ...hostSession, roomId: id });
    rooms().set(id, room);
    sessions().set(hostSession.ws, { ...hostSession, roomId: id });
    return room;
  }
  throw new Error("Could not allocate room id");
}

export function joinRoom(
  room: SignalingRoom,
  session: Omit<Session, "roomId">,
): { ok: true } | { ok: false; reason: "ROOM_FULL" | "ALREADY_IN_ROOM" } {
  room.lastActivityAt = Date.now();

  const existing = room.players.get(session.playerId);
  if (existing) {
    // Reconnect path: drop the stale socket, adopt the new one.
    try {
      existing.ws.close(4000, "replaced");
    } catch {
      /* already closed */
    }
    sessions().delete(existing.ws);
    room.players.set(session.playerId, { ...session, roomId: room.id });
    sessions().set(session.ws, { ...session, roomId: room.id });
    return { ok: true };
  }

  if (room.players.size >= MAX_ROOM_SIZE) {
    return { ok: false, reason: "ROOM_FULL" };
  }

  room.players.set(session.playerId, { ...session, roomId: room.id });
  sessions().set(session.ws, { ...session, roomId: room.id });
  return { ok: true };
}

export function removePlayer(room: SignalingRoom, playerId: PlayerId): boolean {
  const s = room.players.get(playerId);
  if (!s) return false;
  if (s.ws.readyState === WebSocket.OPEN || s.ws.readyState === WebSocket.CONNECTING) {
    try {
      s.ws.close(1000, "left");
    } catch {
      /* ignore */
    }
  }
  sessions().delete(s.ws);
  room.players.delete(playerId);
  room.lastActivityAt = Date.now();
  return true;
}

export function destroyRoomIfEmpty(room: SignalingRoom): void {
  if (room.players.size === 0) rooms().delete(room.id);
}

/**
 * Lazy sweep — invoked on every inbound HTTP request. Rooms that saw no
 * activity for ROOM_TTL_MS are dropped; sockets are closed so clients can
 * immediately detect signaling loss and recover.
 */
export function sweepExpiredRooms(now = Date.now()): void {
  for (const [id, room] of rooms()) {
    if (now - room.lastActivityAt > ROOM_TTL_MS || room.players.size === 0) {
      for (const session of room.players.values()) {
        try {
          session.ws.close(1001, "room expired");
        } catch {
          /* ignore */
        }
        sessions().delete(session.ws);
      }
      rooms().delete(id);
    }
  }
}
