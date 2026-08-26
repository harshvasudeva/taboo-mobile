/**
 * Thin wrapper around a single RTCPeerConnection (react-native-webrtc).
 * Handles SDP creation/exchange callbacks, ICE trickle and one reliable,
 * ordered DataChannel ("game") used for ALL gameplay traffic.
 *
 * NOTE: requires a development build — react-native-webrtc does not run in
 * Expo Go.
 */
import {
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';
import { createLogger, describeIceServer } from '../logger';
import type { IceServerConfig } from '../config';
import type { SdpPayload, IcePayload } from '@shared/networking/protocol';

const log = createLogger('WebRTC');

/** Minimal interface for the data channel — react-native-webrtc v124
 *  doesn't export RTCDataChannel from the main index. */
interface DataChannel {
  readyState: string;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export interface PeerHandlers {
  /** SDP produced locally — caller relays it through signaling. */
  onLocalSdp: (sdp: SdpPayload['sdp']) => void;
  /** Local ICE candidate discovered — relay through signaling. */
  onLocalIce: (ice: IcePayload['ice']) => void;
  /** DataChannel is open → gameplay can start. */
  onDataChannelOpen: () => void;
  onDataChannelClose: () => void;
  onWireMessage: (data: unknown) => void;
  onConnectionStateChanged: (state: string) => void;
}

export class PeerManager {
  pc: RTCPeerConnection | null = null;
  channel: DataChannel | null = null;
  private closedByUs = false;

  constructor(
    public readonly remotePlayerId: string,
    private readonly iceServers: IceServerConfig[],
    private readonly handlers: PeerHandlers,
    private readonly isInitiator: boolean,
  ) {}

  async establish(): Promise<void> {
    log.debug(
      `Creating peer connection → ${this.remotePlayerId} (${this.isInitiator ? 'initiator' : 'receiver'}); ICE: ${this.iceServers.map(describeIceServer).join(' | ') || 'none'}`,
    );
    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState ?? 'unknown';
      log.debug(`Connection state (${this.remotePlayerId}): ${state}`);
      this.handlers.onConnectionStateChanged(state);
      if (state === 'failed') log.warn(`ICE failed for ${this.remotePlayerId} — TURN may be required`);
    };

    this.pc.onicecandidate = (event: unknown) => {
      const c = (event as { candidate: RTCIceCandidate | null }).candidate;
      if (!c) {
        log.debug(`ICE gathering complete → ${this.remotePlayerId}`);
        return;
      }
      this.handlers.onLocalIce(toIcePayload(c));
    };

    this.pc.oniceconnectionstatechange = () => {
      log.debug(
        `ICE state (${this.remotePlayerId}): ${this.pc?.iceConnectionState ?? '?'}`,
      );
    };

    if (this.isInitiator) {
      const ch = this.pc!.createDataChannel('game', { ordered: true });
      this.attachChannel(ch as unknown as DataChannel);
      await this.createAndSendOffer();
    } else {
      this.pc!.ondatachannel = (event: unknown) => {
        const ch = (event as { channel: DataChannel }).channel;
        log.debug(`Data channel received from ${this.remotePlayerId}`);
        this.attachChannel(ch);
      };
    }
  }

  private attachChannel(ch: DataChannel): void {
    this.channel = ch;
    ch.onopen = () => {
      log.debug(`Data channel opened ↔ ${this.remotePlayerId}`);
      this.handlers.onDataChannelOpen();
    };
    ch.onclose = () => {
      log.debug(`Data channel closed ↔ ${this.remotePlayerId}`);
      this.handlers.onDataChannelClose();
    };
    ch.onmessage = (event) => {
      try {
        this.handlers.onWireMessage(JSON.parse(String(event.data)));
      } catch {
        log.warn('Unparsable data channel message');
      }
    };
  }

  private async createAndSendOffer(): Promise<void> {
    log.debug('Creating offer…');
    const offer = await this.pc!.createOffer({});
    await this.pc!.setLocalDescription(offer);
    this.handlers.onLocalSdp({ type: 'offer', sdp: offer.sdp! });
  }

  /** Remote SDP arrived over signaling. */
  async handleRemoteSdp(sdp: SdpPayload['sdp']): Promise<void> {
    if (sdp.type === 'offer') {
      log.debug(`Received offer from ${this.remotePlayerId}`);
      await this.pc!.setRemoteDescription(new RTCSessionDescription(sdp));
      log.debug('Creating answer…');
      const answer = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(answer);
      this.handlers.onLocalSdp({ type: 'answer', sdp: answer.sdp! });
    } else {
      log.debug(`Received answer from ${this.remotePlayerId}`);
      await this.pc!.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  /** Remote ICE candidate arrived over signaling. */
  async handleRemoteIce(ice: IcePayload['ice']): Promise<void> {
    log.debug(`ICE candidate received ← ${this.remotePlayerId}`);
    await this.pc!.addIceCandidate(
      new RTCIceCandidate({
        candidate: ice.candidate,
        sdpMid: ice.sdpMid ?? undefined,
        sdpMLineIndex: ice.sdpMLineIndex ?? undefined,
      }),
    );
  }

  get isOpen(): boolean {
    return this.channel?.readyState === 'open';
  }

  get connectionState(): string {
    return this.pc?.connectionState ?? 'new';
  }

  send(obj: unknown): boolean {
    if (!this.isOpen) return false;
    this.channel!.send(JSON.stringify(obj));
    return true;
  }

  close(): void {
    this.closedByUs = true;
    try {
      this.channel?.close();
      this.pc?.close();
    } catch {
      /* ignore */
    }
    this.channel = null;
    this.pc = null;
    log.debug(`Peer connection closed → ${this.remotePlayerId}`);
  }

  get intentionallyClosed(): boolean {
    return this.closedByUs;
  }
}

function toIcePayload(c: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null }): IcePayload['ice'] {
  return {
    candidate: c.candidate,
    sdpMid: c.sdpMid ?? null,
    sdpMLineIndex: c.sdpMLineIndex ?? null,
    usernameFragment: c.usernameFragment ?? null,
  };
}
