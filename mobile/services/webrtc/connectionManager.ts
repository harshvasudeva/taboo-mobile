/**
 * WebRTCTransport — star-topology implementation of the shared GameTransport.
 *
 *   HOST ◄── DataChannel ──► GUEST (each guest connects ONLY to the host)
 *
 * All gameplay flows host↔guest over DataChannels. The signaling Worker is
 * used strictly for SDP/ICE exchange and presence, then goes quiet.
 */
import { getIceServers } from '../config';
import { createLogger } from '../logger';
import { PeerManager } from './peerManager';
import type {
  GameTransport,
  PeerTarget,
  TransportEvent,
} from '@shared/networking/transport';
import type { GameCommand } from '@shared/networking/events';
import type {
  GameWireMessage,
  SignalClientMessage,
  SignalServerMessage,
} from '@shared/networking/protocol';
import type { PlayerId } from '@shared/types/player';

const log = createLogger('WebRTC:Transport');

export interface TransportDeps {
  myId: PlayerId;
  role: 'host' | 'guest';
  /** Relay helper owned by the room hook (signaling client). */
  sendSignal: (msg: SignalClientMessage) => boolean;
}

export class WebRtcStarTransport implements GameTransport {
  readonly role: 'host' | 'guest';

  private peers = new Map<PlayerId, PeerManager>();
  private listeners = new Set<(evt: TransportEvent) => void>();
  private iceServers = getIceServers();

  constructor(private deps: TransportDeps) {
    this.role = deps.role;
  }

  // ---------- GameTransport ----------

  async connect(): Promise<void> {
    // Connection is event-driven from signaling messages:
    //   host: room_created → peer_joined → offer
    //   guest: room_joined → wait for host's offer
    log.debug(`Transport ready (role=${this.role}, me=${this.deps.myId})`);
  }

  sendCommand(cmd: GameCommand): void {
    if (this.role !== 'guest') return; // host applies commands directly
    const hostPeer = [...this.peers.values()][0];
    if (!hostPeer || !hostPeer.isOpen) {
      log.warn('Cannot send command — no open channel to host');
      return;
    }
    hostPeer.send({ kind: 'game', cmd });
  }

  deliver(outbound: { to: PeerTarget; msg: GameWireMessage }): void {
    const targets =
      outbound.to === 'all'
        ? [...this.peers.values()]
        : this.peers.has(outbound.to)
          ? [this.peers.get(outbound.to)!]
          : [];

    let undelivered = 0;
    for (const peer of targets) {
      if (!peer.send(outbound.msg)) undelivered++;
    }
    if (undelivered > 0 && targets.length > 0) {
      log.warn(`${undelivered}/${targets.length} channels not open for delivery`);
    }
  }

  onEvent(cb: (evt: TransportEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  connectedPeerCount(): number {
    return [...this.peers.values()].filter((p) => p.isOpen).length;
  }

  disconnect(): void {
    this.peers.forEach((p) => p.close());
    this.peers.clear();
    log.debug('Transport disconnected');
  }

  /**
   * Entry point fed by the room hook: every signaling message is pushed here
   * so the transport can react (offers/answers/ICE/presence).
   */
  handleSignalingMessage(msg: SignalServerMessage): void {
    this.onSignaling(msg);
  }

  // ---------- Signaling → WebRTC wiring ----------

  private emit(evt: TransportEvent): void {
    this.listeners.forEach((cb) => cb(evt));
  }

  private peerFor(playerId: PlayerId): PeerManager {
    let peer = this.peers.get(playerId);
    if (!peer) {
      peer = new PeerManager(
        playerId,
        this.iceServers,
        {
          onLocalSdp: (sdp) =>
            this.deps.sendSignal({
              kind: 'signal',
              t: 'signal',
              v: 1,
              roomId: this.roomId!,
              to: playerId,
              payload: { sdp },
            }),
          onLocalIce: (ice) =>
            this.deps.sendSignal({
              kind: 'signal',
              t: 'signal',
              v: 1,
              roomId: this.roomId!,
              to: playerId,
              payload: { ice },
            }),
          onDataChannelOpen: () => {
            if (this.role === 'host') {
              this.emit({ kind: 'presence', event: { type: 'peer_connected', playerId } });
            } else {
              this.emit({ kind: 'presence', event: { type: 'peer_connected', playerId } });
            }
          },
          onDataChannelClose: () => {
            if (!peer!.intentionallyClosed) {
              this.emit({
                kind: 'presence',
                event: { type: 'peer_disconnected', playerId },
              });
              if (this.role === 'guest') this.emit({ kind: 'host_lost' });
            }
            this.peers.delete(playerId);
          },
          onWireMessage: (data) => {
            const msg = data as GameWireMessage;
            if (msg?.kind === 'game') this.emit({ kind: 'wire', from: playerId, msg });
          },
          onConnectionStateChanged: () => {},
        },
        // Initiator of SDP offers = HOST (star topology).
        this.role === 'host',
      );
      this.peers.set(playerId, peer);
      void peer.establish();
    }
    return peer;
  }

  private roomId: string | null = null;

  setRoom(roomId: string): void {
    this.roomId = roomId;
  }

  /** Tear down a specific peer (e.g. guest left the signaling room). */
  dropPeer(playerId: PlayerId): void {
    this.peers.get(playerId)?.close();
    this.peers.delete(playerId);
  }

  private onSignaling(msg: SignalServerMessage): void {
    switch (msg.t) {
      case 'room_created':
      case 'room_joined':
        this.setRoom(msg.roomId);
        break;

      case 'peer_joined':
        if (this.role === 'host') {
          log.debug(`Guest ${msg.playerId} joined — initiating offer`);
          this.peerFor(msg.playerId); // host initiates
        }
        break;

      case 'peer_left':
        if (this.role === 'guest' && msg.playerId === this.hostIdFromJoin) {
          this.emit({ kind: 'host_lost' });
        }
        this.dropPeer(msg.playerId);
        break;

      case 'signal': {
        if (isSdp(msg.payload)) {
          const peer = this.peerFor(msg.from);
          void peer.handleRemoteSdp(msg.payload.sdp).catch((err) =>
            log.error('Remote SDP handling failed', err),
          );
        } else if (isIce(msg.payload)) {
          const peer = this.peers.get(msg.from);
          if (!peer) {
            // Candidate raced ahead of SDP; buffer-less MVP drops it.
            log.warn(`ICE before peer ready (${msg.from}) — dropped`);
            return;
          }
          void peer.handleRemoteIce(msg.payload.ice).catch((err) =>
            log.error('ICE handling failed', err),
          );
        }
        break;
      }
    }
  }

  private hostIdFromJoin: PlayerId | null = null;

  noteHostJoined(hostId: PlayerId): void {
    this.hostIdFromJoin = hostId;
  }
}

function isSdp(p: unknown): p is { sdp: { type: 'offer' | 'answer'; sdp: string } } {
  return typeof p === 'object' && p !== null && 'sdp' in p;
}
function isIce(p: unknown): p is { ice: { candidate: string } } {
  return typeof p === 'object' && p !== null && 'ice' in p;
}
