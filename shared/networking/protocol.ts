/**
 * Wire protocol shared by mobile clients and the Cloudflare Worker.
 *
 * Two strictly separated kinds:
 *  - kind:"signal" → WebRTC establishment only (SDP / ICE / presence)
 *  - kind:"game"   → gameplay events over DataChannels after connection
 *
 * The Worker understands ONLY signal messages. It never needs game messages.
 */
import type { GameCommand } from "./events";
import type { GameEvent } from "./events";
import type { PlayerId } from "../types/player";

export const PROTOCOL_VERSION = 1;

// ---------- Signaling messages (client ↔ Worker over WebSocket) ----------

export interface CreateRoomMsg {
  kind: "signal";
  t: "create_room";
  v: number;
  name: string;
  /** Stable client-generated id; enables deterministic host election. */
  playerId: PlayerId;
}
export interface JoinRoomMsg {
  kind: "signal";
  t: "join_room";
  v: number;
  roomId: string;
  name: string;
  playerId: PlayerId;
}
export interface SignalRelayMsg {
  kind: "signal";
  t: "signal";
  v: number;
  roomId: string;
  /** Target peer. In star topology guests always address the host and vice versa. */
  to: PlayerId;
  /** Opaque SDP offer/answer or ICE candidate payload. */
  payload: SdpPayload | IcePayload;
}
export interface LeaveRoomMsg {
  kind: "signal";
  t: "leave_room";
  v: number;
  roomId: string;
}
export interface PingMsg {
  kind: "signal";
  t: "ping";
  v: number;
}

export type SignalClientMessage =
  | CreateRoomMsg
  | JoinRoomMsg
  | SignalRelayMsg
  | LeaveRoomMsg
  | PingMsg;

export interface RoomCreatedMsg {
  kind: "signal";
  t: "room_created";
  roomId: string;
  playerId: PlayerId;
}
export interface RoomJoinedMsg {
  kind: "signal";
  t: "room_joined";
  roomId: string;
  playerId: PlayerId;
  hostId: PlayerId;
  players: { id: PlayerId; name: string; isHost: boolean }[];
}
export interface PeerJoinedMsg {
  kind: "signal";
  t: "peer_joined";
  playerId: PlayerId;
  name: string;
}
export interface PeerLeftMsg {
  kind: "signal";
  t: "peer_left";
  playerId: PlayerId;
}
export interface SignalRelayedMsg {
  kind: "signal";
  t: "signal";
  from: PlayerId;
  payload: SdpPayload | IcePayload;
}
export interface PongMsg {
  kind: "signal";
  t: "pong";
}
export interface SignalErrorMsg {
  kind: "signal";
  t: "error";
  code:
    | "ROOM_NOT_FOUND"
    | "ROOM_FULL"
    | "ALREADY_IN_ROOM"
    | "PLAYER_NOT_FOUND"
    | "BAD_MESSAGE"
    | "SERVER_ERROR";
  message: string;
}

export type SignalServerMessage =
  | RoomCreatedMsg
  | RoomJoinedMsg
  | PeerJoinedMsg
  | PeerLeftMsg
  | SignalRelayedMsg
  | PongMsg
  | SignalErrorMsg;

// ---------- SDP / ICE payloads ----------

export interface SdpPayload {
  sdp: { type: "offer" | "answer"; sdp: string };
}
export interface IcePayload {
  ice: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
}

export function isSdpPayload(p: unknown): p is SdpPayload {
  return typeof p === "object" && p !== null && "sdp" in p;
}
export function isIcePayload(p: unknown): p is IcePayload {
  return typeof p === "object" && p !== null && "ice" in p;
}

// ---------- Game messages (peer ↔ peer over DataChannel) ----------

export interface GameCommandMessage {
  kind: "game";
  cmd: GameCommand;
}
export interface GameEventMessage {
  kind: "game";
  evt: GameEvent;
}
/** Targeted event delivered only to one peer (e.g. card → describer). */
export interface GameTargetedEventMessage extends GameEventMessage {
  to: PlayerId;
}
export type GameWireMessage =
  | GameCommandMessage
  | GameEventMessage
  | GameTargetedEventMessage;

export function isSignalMessage(msg: unknown): msg is SignalClientMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { kind?: string }).kind === "signal"
  );
}

export function gameCommand(cmd: GameCommand): GameCommandMessage {
  return { kind: "game", cmd };
}
export function gameEvent(evt: GameEvent): GameEventMessage {
  return { kind: "game", evt };
}
export function targetedGameEvent(
  evt: GameEvent,
  to: PlayerId,
): GameTargetedEventMessage {
  return { kind: "game", evt, to };
}
