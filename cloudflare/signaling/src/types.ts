/**
 * Signaling Worker types. Deliberately minimal: the Worker only knows enough
 * to connect peers — never game state.
 */
import type { PlayerId } from "../../../shared/types/player";
import { MAX_ROOM_SIZE as SHARED_MAX_ROOM_SIZE } from "../../../shared/types/room";
import type {
  SignalClientMessage,
  SignalServerMessage,
} from "../../../shared/networking/protocol";

export const MAX_ROOM_SIZE = SHARED_MAX_ROOM_SIZE;
export const ROOM_TTL_MS = 10 * 60 * 1000; // idle rooms die after 10 minutes
export const MAX_SDP_LENGTH = 32 * 1024;

export interface Session {
  playerId: PlayerId;
  name: string;
  roomId: string;
  ws: WebSocket;
  joinedAt: number;
}

export interface SignalingRoom {
  id: string;
  hostId: PlayerId;
  createdAt: number;
  lastActivityAt: number;
  /** Ordered by join time; index 0 after host is the deterministic successor. */
  players: Map<PlayerId, Session>;
}

/** Global in-isolate registry. See wrangler.toml note re: Durable Objects. */
declare global {
  // eslint-disable-next-line no-var
  var __tabooRooms: Map<string, SignalingRoom> | undefined;
  // eslint-disable-next-line no-var
  var __tabooSessions: Map<WebSocket, Session> | undefined;
}

export function rooms(): Map<string, SignalingRoom> {
  globalThis.__tabooRooms ??= new Map<string, SignalingRoom>();
  return globalThis.__tabooRooms;
}

export function sessions(): Map<WebSocket, Session> {
  globalThis.__tabooSessions ??= new Map<WebSocket, Session>();
  return globalThis.__tabooSessions;
}

export type ServerSend = (msg: SignalServerMessage) => void;
export type ClientParseResult =
  | { ok: true; msg: SignalClientMessage }
  | { ok: false; error: string };
