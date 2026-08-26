/**
 * Transport abstraction so the future web migration can swap
 * Socket.IO ↔ WebRTC without touching game/UI code.
 *
 * WebRTCTransport lives in mobile/services/webrtc (needs react-native-webrtc).
 * A SocketIOTransport can later wrap the EXISTING server events.
 */
import type { PlayerId } from "../types/player";
import type { GameCommand } from "./events";
import type { GameWireMessage } from "./protocol";

export type PeerTarget = "all" | PlayerId;

export interface PeerPresenceEvent {
  type: "peer_connected" | "peer_disconnected";
  playerId: PlayerId;
}

export interface HostDisconnectedEvent {
  type: "host_disconnected";
}

export type TransportEvent =
  | { kind: "wire"; from: PlayerId; msg: GameWireMessage }
  | { kind: "presence"; event: PeerPresenceEvent }
  | { kind: "host_lost" };

export interface GameTransport {
  readonly role: "host" | "guest";

  /** Establish all peer connections (signaling + SDP/ICE + DataChannels). */
  connect(): Promise<void>;

  /** Send a game command to the host (guests) — host ignores. */
  sendCommand(cmd: GameCommand): void;

  /**
   * Deliver engine output. `to:"all"` fans out over every DataChannel;
   * a playerId targets one peer (e.g. the describer's card).
   */
  deliver(outbound: { to: PeerTarget; msg: GameWireMessage }): void;

  /** Push a raw signaling message into the transport (SDP/ICE/presence). */
  handleSignalingMessage?(raw: unknown): void;

  onEvent(cb: (evt: TransportEvent) => void): () => void;

  connectedPeerCount(): number;

  disconnect(): void;
}
