/**
 * Low-level connection hook: owns the SignalingClient and the WebRTC star
 * transport. React components never touch SDP/ICE directly (§14).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { SignalingClient } from '../services/signaling/signalingClient';
import type { SignalingStatus } from '../services/signaling/signalingClient';
import { WebRtcStarTransport } from '../services/webrtc/connectionManager';
import type { PlayerId } from '@shared/types/player';

export function useWebRTC(myId: PlayerId) {
  const signalingRef = useRef<SignalingClient | null>(null);
  const transportRef = useRef<WebRtcStarTransport | null>(null);
  const [signalingStatus, setSignalingStatus] =
    useState<SignalingStatus>('idle');

  /**
   * Creates (once per session) the signaling client + transport.
   * The transport subscribes to signaling messages in its constructor,
   * BEFORE connect() is awaited — no messages are missed.
   */
  const ensureClients = useCallback(
    (role: 'host' | 'guest', signalingUrl: string) => {
      if (!transportRef.current) {
        if (!signalingRef.current) {
          signalingRef.current = new SignalingClient({
            url: `${signalingUrl.replace(/\/$/, '')}/ws`,
            onStatus: setSignalingStatus,
          });
        }
        transportRef.current = new WebRtcStarTransport({
          myId,
          role,
          sendSignal: (msg) => signalingRef.current!.send(msg),
        });
      }
    },
    [myId],
  );

  /** After a reconnect the transport needs re-arming for a fresh room. */
  const resetTransport = useCallback(() => {
    transportRef.current?.disconnect();
    transportRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    transportRef.current?.disconnect();
    transportRef.current = null;
    signalingRef.current?.close();
    signalingRef.current = null;
    setSignalingStatus('idle');
  }, []);

  return useMemo(
    () => ({
      signalingRef,
      transportRef,
      signalingStatus,
      ensureClients,
      resetTransport,
      teardown,
    }),
    [signalingStatus, ensureClients, resetTransport, teardown],
  );
}
