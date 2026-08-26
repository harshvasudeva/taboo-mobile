/**
 * Facade used by every screen. Combines:
 *   useRoom (signaling lifecycle) + WebRtcStarTransport (P2P)
 *   + HostGameEngine (host) / client-view reducer (everyone)
 *
 * Screens stay dumb: they render `view` + `roster` and call actions.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HostGameEngine, initialGameView, applyGameEvent } from '@shared/game';
import type { GameView } from '@shared/game';
import { toPlayerInfo } from '@shared/networking/events';
import type { GameCommand } from '@shared/networking/events';
import type { PlayerId } from '@shared/types/player';
import { SignalingClient } from '../services/signaling/signalingClient';
import { getHostDeck } from '../lib/words';
import { useRoom } from './useRoom';

export function usePlayerId(name?: string): PlayerId {
  return useMemo(() => SignalingClient.playerIdFor(name ?? 'player'), [name]);
}

export function useGameConnection(myId: PlayerId) {
  const room = useRoom(myId);

  const [view, setView] = useState<GameView>(initialGameView);
  const engineRef = useRef<HostGameEngine | null>(null);
  const role = room.role;

  // ----- Transport events → view/engine -----

  useEffect(() => {
    const transport = room.transportRef.current;
    if (!transport) return;

    const off = transport.onEvent((evt) => {
      switch (evt.kind) {
        case 'wire': {
          const msg = evt.msg;
          if (msg.kind === 'game' && 'evt' in msg && msg.evt.type !== undefined) {
            // Game EVENT → everyone applies to their local view.
        setView((v: GameView) => applyGameEvent(v, msg, myId));
          } else if (msg.kind === 'game') {
            // Game COMMAND → host validates via engine.
            const engine = engineRef.current;
            if (engine && role.current === 'host') {
              deliver(engine.handleCommand((msg as { cmd: GameCommand }).cmd));
            }
          }
          break;
        }
        case 'presence':
          if (role.current === 'host' && engineRef.current) {
            if (evt.event.type === 'peer_connected') {
              // DataChannel opened ⇒ playable peer. Name arrives via the
              // first message? MVP: signaling roster supplies names; the
              // guest's first command carries its id and we already know it.
              const known = room.roster.find((p) => p.id === evt.event.playerId);
              deliver(
                engineRef.current.addPlayer(evt.event.playerId, known?.name ?? 'Player'),
              );
            } else {
              deliver(engineRef.current.removePlayer(evt.event.playerId));
            }
          }
          break;
        case 'host_lost':
          // surfaced via room.hostLost too; keep view intact for display
          break;
      }
    });
    return off;
  }, [room.transportRef.current, room.transportRef, myId, role, room.roster]);

  /** Deliver engine outputs over P2P AND into the host's own view reducer. */
  const deliver = useCallback(
    (outbound: ReturnType<HostGameEngine['handleCommand']>) => {
      const transport = room.transportRef.current;
      for (const o of outbound) {
        transport?.deliver({ to: o.to, msg: o.msg });
        // Targeted events (describer card) must not land in the host UI
        // unless this device is the addressee.
        if (o.to === 'all' || o.to === myId) {
          setView((v: GameView) => applyGameEvent(v, o.msg, myId));
        }
      }
    },
    [myId, room.transportRef],
  );

  // ----- Host tick: timer expiry checked locally, no network ticks -----
  useEffect(() => {
    if (role.current !== 'host') return;
    const id = setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      const out = engine.tick();
      if (out.length > 0) deliver(out);
    }, 1000);
    return () => clearInterval(id);
  }, [role, deliver]);

  // ----- Actions -----

  const createGame = useCallback(
    async (name: string) => {
      const ok = await room.create(name);
      if (!ok) return false;
      engineRef.current = new HostGameEngine(myId, name, getHostDeck());
      setView(initialGameView());
      return true;
    },
    [myId, room],
  );

  const joinGame = useCallback(
    async (code: string, name: string) => room.join(code, name),
    [room],
  );

  const leaveGame = useCallback(() => {
    engineRef.current = null;
    setView(initialGameView());
    room.leave();
  }, [room]);

  /** Host runs commands locally through the engine. */
  const hostCmd = useCallback(
    (cmd: GameCommand) => {
      const engine = engineRef.current;
      if (engine) deliver(engine.handleCommand(cmd));
    },
    [deliver],
  );

  const sendOrRun = useCallback(
    (cmd: GameCommand) => {
      if (role.current === 'host') hostCmd(cmd);
      else room.transportRef.current?.sendCommand(cmd);
    },
    [hostCmd, role, room.transportRef],
  );

  const startGame = useCallback(() => {
    sendOrRun({ type: 'START_GAME', playerId: myId });
  }, [myId, sendOrRun]);

  const guess = useCallback(
    (value: string) => {
      sendOrRun({ type: 'GUESS', playerId: myId, value });
    },
    [myId, sendOrRun],
  );

  const skipCard = useCallback(() => {
    sendOrRun({ type: 'SKIP', playerId: myId });
  }, [myId, sendOrRun]);

  const endTurn = useCallback(() => {
    sendOrRun({ type: 'END_TURN', playerId: myId });
  }, [myId, sendOrRun]);

  const switchTeam = useCallback(
    (teamIndex: 0 | 1) => {
      sendOrRun({ type: 'JOIN_TEAM', playerId: myId, teamIndex });
    },
    [myId, sendOrRun],
  );

  const playAgain = useCallback(() => {
    if (role.current === 'host') startGame();
  }, [role, startGame]);

  // ----- Normalized roster for screens -----

  const roster = useMemo(() => {
    if (role.current === 'host' && engineRef.current) {
      return [...engineRef.current.players.values()].map(toPlayerInfo);
    }
    return [
      ...view.teams[0].members,
      ...view.teams[1].members,
      ...view.unassigned,
    ];
  }, [view, role]);

  const isDescriber = view.describerId === myId;
  const amInCurrentTeam =
    view.teams[view.currentTeamIndex]?.members.some((m: { id: string }) => m.id === myId) ??
    false;
  const iCanGuess = view.phase === 'playing' && view.turn !== null && amInCurrentTeam && !isDescriber;

  return {
    // identity/state
    myId,
    roomId: room.roomId,
    roster,
    view,
    signalingStatus: room.signalingStatus,
    hostLost: room.hostLost,
    error: room.error,
    clearError: room.clearError,
    SIGNALING_URL: room.SIGNALING_URL,
    // capabilities
    isHost: () => role.current === 'host',
    isDescriber,
    iCanGuess,
    // actions
    createGame,
    joinGame,
    leaveGame,
    startGame,
    guess,
    skipCard,
    endTurn,
    switchTeam,
    playAgain,
  };
}
