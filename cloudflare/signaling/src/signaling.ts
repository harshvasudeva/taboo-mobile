/**
 * Signaling message handlers. The Worker relays SDP/ICE opaquely — it never
 * inspects, transforms, or stores connection payloads beyond the hop.
 */
import type { PlayerId } from "../../../shared/types/player";
import { MAX_ROOM_SIZE } from "../../../shared/types/room";
import { isIcePayload, isSdpPayload } from "../../../shared/networking/protocol";
import type { SignalClientMessage } from "../../../shared/networking/protocol";
import {
  createRoom,
  destroyRoomIfEmpty,
  getRoom,
  joinRoom,
  removePlayer,
} from "./rooms";
import type { Session, SignalingRoom } from "./types";
import { MAX_SDP_LENGTH } from "./types";
import { sweepExpiredRooms } from "./rooms";

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: SignalingRoom, msg: unknown, exceptPlayerId?: PlayerId): void {
  for (const [pid, session] of room.players) {
    if (pid === exceptPlayerId) continue;
    send(session.ws, msg);
  }
}

export function handleMessage(ws: WebSocket, raw: string): void {
  let msg: SignalClientMessage;
  try {
    msg = JSON.parse(raw) as SignalClientMessage;
  } catch {
    send(ws, { kind: "signal", t: "error", code: "BAD_MESSAGE", message: "Invalid JSON" });
    return;
  }

  const session = globalThis.__tabooSessions?.get(ws);
  sweepExpiredRooms();

  switch (msg.t) {
    case "ping":
      send(ws, { kind: "signal", t: "pong" });
      return;

    case "create_room": {
      if (!validIdentity(msg.playerId, msg.name)) {
        send(ws, { kind: "signal", t: "error", code: "BAD_MESSAGE", message: "Invalid identity" });
        return;
      }
      if (session) leaveCurrentRoom(session);
      const room = createRoom({ playerId: msg.playerId, name: msg.name, ws, joinedAt: Date.now() });
      send(ws, {
        kind: "signal",
        t: "room_created",
        roomId: room.id,
        playerId: msg.playerId,
      });
      return;
    }

    case "join_room": {
      if (!validIdentity(msg.playerId, msg.name)) {
        send(ws, { kind: "signal", t: "error", code: "BAD_MESSAGE", message: "Invalid identity" });
        return;
      }
      const room = getRoom(msg.roomId);
      if (!room) {
        send(ws, { kind: "signal", t: "error", code: "ROOM_NOT_FOUND", message: `Room ${msg.roomId} not found or expired` });
        return;
      }
      if (session && session.roomId !== room.id) leaveCurrentRoom(session);

      const result = joinRoom(room, {
        playerId: msg.playerId,
        name: msg.name,
        ws,
        joinedAt: Date.now(),
      });
      if (!result.ok) {
        send(ws, {
          kind: "signal",
          t: "error",
          code: result.reason,
          message:
            result.reason === "ROOM_FULL"
              ? `Room is full (max ${MAX_ROOM_SIZE} players)`
              : "Already in this room",
        });
        return;
      }

      // Tell the joiner everything it needs to build the star topology.
      send(ws, {
        kind: "signal",
        t: "room_joined",
        roomId: room.id,
        playerId: msg.playerId,
        hostId: room.hostId,
        players: [...room.players.values()].map((s) => ({
          id: s.playerId,
          name: s.name,
          isHost: s.playerId === room.hostId,
        })),
      });

      // Everyone else learns about the new peer (host will offer).
      broadcast(
        room,
        { kind: "signal", t: "peer_joined", playerId: msg.playerId, name: msg.name },
        msg.playerId,
      );
      return;
    }

    case "signal": {
      if (!session) {
        send(ws, { kind: "signal", t: "error", code: "PLAYER_NOT_FOUND", message: "Join a room first" });
        return;
      }
      const room = getRoom(session.roomId);
      if (!room) {
        send(ws, { kind: "signal", t: "error", code: "ROOM_NOT_FOUND", message: "Room expired" });
        return;
      }
      room.lastActivityAt = Date.now();

      if (!isSdpPayload(msg.payload) && !isIcePayload(msg.payload)) {
        send(ws, { kind: "signal", t: "error", code: "BAD_MESSAGE", message: "Unknown signal payload" });
        return;
      }
      if (isSdpPayload(msg.payload) && msg.payload.sdp.sdp.length > MAX_SDP_LENGTH) {
        send(ws, { kind: "signal", t: "error", code: "BAD_MESSAGE", message: "SDP too large" });
        return;
      }

      const target = room.players.get(msg.to);
      if (!target) {
        send(ws, { kind: "signal", t: "error", code: "PLAYER_NOT_FOUND", message: "Target peer not in room" });
        return;
      }
      // Opaque relay. The Worker does not understand SDP/ICE contents.
      send(target.ws, { kind: "signal", t: "signal", from: session.playerId, payload: msg.payload });
      return;
    }

    case "leave_room": {
      if (!session) return;
      leaveCurrentRoom(session);
      send(ws, { kind: "signal", t: "peer_left", playerId: session.playerId }); // self-ack
      return;
    }

    default: {
      send(ws, { kind: "signal", t: "error", code: "BAD_MESSAGE", message: "Unknown message type" });
    }
  }
}

/** WebSocket closed unexpectedly → notify the room, clean up. */
export function handleDisconnect(ws: WebSocket): void {
  const session = globalThis.__tabooSessions?.get(ws);
  if (!session) return;
  leaveCurrentRoom(session);
}

function leaveCurrentRoom(session: Session): void {
  const room = getRoom(session.roomId);
  globalThis.__tabooSessions?.delete(session.ws);
  if (!room) return;
  removePlayer(room, session.playerId);
  broadcast(room, { kind: "signal", t: "peer_left", playerId: session.playerId });
  destroyRoomIfEmpty(room);
}

function validIdentity(playerId: string, name: string): boolean {
  return (
    typeof playerId === "string" &&
    playerId.length >= 6 &&
    playerId.length <= 64 &&
    typeof name === "string" &&
    name.trim().length > 0 &&
    name.length <= 32
  );
}
