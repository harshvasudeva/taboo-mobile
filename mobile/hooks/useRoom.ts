/**
 * Room lifecycle over signaling: create / join / leave / rejoin,
 * plus host-loss detection. Owns the single signaling message sink and
 * forwards everything to the WebRTC transport.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerId } from '@shared/types/player';
import { useWebRTC } from './useWebRTC';
import type { SignalServerMessage } from '@shared/networking/protocol';

const SIGNALING_URL =
  process.env.EXPO_PUBLIC_SIGNALING_URL || 'https://taboo-signaling.ishpreet.workers.dev';

export interface RosterEntry {
  id: PlayerId;
  name: string;
  isHost: boolean;
}

export function useRoom(myId: PlayerId) {
  const webrtc = useWebRTC(myId);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hostLost, setHostLost] = useState(false);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [hostId, setHostId] = useState<PlayerId | null>(null);
  const roleRef = useRef<'host' | 'guest'>('host');
  const nameRef = useRef<string>('');

  const handleMsg = useCallback(
    (msg: SignalServerMessage) => {
      switch (msg.t) {
        case 'room_created':
          setRoomId(msg.roomId);
          setHostId(myId);
          setRoster([{ id: myId, name: nameRef.current, isHost: true }]);
          setError(null);
          break;
        case 'room_joined':
          setRoomId(msg.roomId);
          setHostId(msg.hostId);
          setRoster(msg.players);
          setError(null);
          break;
        case 'peer_joined':
          setRoster((prev) =>
            prev.some((p) => p.id === msg.playerId)
              ? prev
              : [...prev, { id: msg.playerId, name: msg.name, isHost: false }],
          );
          break;
        case 'peer_left': {
          if (roleRef.current === 'guest' && msg.playerId === hostId) {
            setHostLost(true);
          }
          setRoster((prev) => prev.filter((p) => p.id !== msg.playerId));
          break;
        }
        case 'error':
          setError(msg.message);
          break;
        default:
          break;
      }
    },
    [hostId, myId],
  );

  /** Wire the sink AFTER transport exists so it also receives messages. */
  const attachSink = useCallback(() => {
    const client = webrtc.signalingRef.current;
    const transport = webrtc.transportRef.current;
    if (!client || !transport) return;
    client.onMessage = (msg) => {
      transport.handleSignalingMessage(msg);
      handleMsg(msg);
    };
  }, [handleMsg, webrtc.signalingRef, webrtc.transportRef]);

  const create = useCallback(
    async (name: string): Promise<boolean> => {
      roleRef.current = 'host';
      nameRef.current = name;
      setRoomId(null);
      setHostLost(false);
      setError(null);
      webrtc.ensureClients('host', SIGNALING_URL);
      attachSink();
      try {
        await webrtc.signalingRef.current!.connect();
      } catch {
        setError('Cannot reach signaling server. Is `wrangler dev` running?');
        return false;
      }
      return webrtc.signalingRef.current!.send({
        kind: 'signal',
        t: 'create_room',
        v: 1,
        name,
        playerId: myId,
      });
    },
    [attachSink, myId, webrtc],
  );

  const join = useCallback(
    async (code: string, name: string): Promise<boolean> => {
      roleRef.current = 'guest';
      nameRef.current = name;
      setRoomId(null);
      setHostLost(false);
      setError(null);
      webrtc.ensureClients('guest', SIGNALING_URL);
      attachSink();
      try {
        await webrtc.signalingRef.current!.connect();
      } catch {
        setError('Cannot reach signaling server. Check EXPO_PUBLIC_SIGNALING_URL.');
        return false;
      }
      return webrtc.signalingRef.current!.send({
        kind: 'signal',
        t: 'join_room',
        v: 1,
        roomId: code.trim().toUpperCase(),
        name,
        playerId: myId,
      });
    },
    [attachSink, myId, webrtc],
  );

  // Signaling socket died → reconnect then RE-JOIN with the same stable id.
  // The worker keeps the room alive for ROOM_TTL_MS; if it expired we surface an error.
  const lastStatusRef = useRef(webrtc.signalingStatus);
  useEffect(() => {
    const prev = lastStatusRef.current;
    lastStatusRef.current = webrtc.signalingStatus;
    if (
      prev === 'reconnecting' &&
      webrtc.signalingStatus === 'connected' &&
      roomId
    ) {
      webrtc.resetTransport(); // fresh peer connections needed anyway
      webrtc.ensureClients(roleRef.current, SIGNALING_URL);
      attachSink();
      if (roleRef.current === 'host') {
        webrtc.signalingRef.current!.send({
          kind: 'signal',
          t: 'create_room',
          v: 1,
          name: nameRef.current,
          playerId: myId,
        });
      } else {
        webrtc.signalingRef.current!.send({
          kind: 'signal',
          t: 'join_room',
          v: 1,
          roomId: roomId!,
          name: nameRef.current,
          playerId: myId,
        });
      }
    }
  }, [webrtc.signalingStatus, roomId, attachSink, myId, webrtc]);

  const leave = useCallback(() => {
    if (roomId) {
      webrtc.signalingRef.current?.send({
        kind: 'signal',
        t: 'leave_room',
        v: 1,
        roomId,
      });
    }
    webrtc.teardown();
    setRoomId(null);
    setRoster([]);
    setHostLost(false);
    setError(null);
    setHostId(null);
  }, [roomId, webrtc]);

  return {
    ...webrtc,
    roomId,
    roster,
    hostId,
    hostLost,
    error,
    clearError: () => setError(null),
    create,
    join,
    leave,
    role: roleRef,
    SIGNALING_URL,
  };
}
