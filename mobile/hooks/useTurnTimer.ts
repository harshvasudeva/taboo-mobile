/**
 * Local countdown from a single synchronized ROUND_STARTED event.
 * ZERO network ticks — remaining time is derived on-device:
 *
 *   remaining(t) = durationMs - ((t - anchorLocalMs) + hostElapsedAtArrival)
 *
 * This also avoids clock-skew issues between devices.
 */
import { useEffect, useRef, useState } from 'react';

export interface TurnWindow {
  startedAt: number; // host epoch ms
  durationMs: number;
}

export function useTurnTimer(turn: TurnWindow | null, active: boolean): {
  remainingMs: number;
  expired: boolean;
} {
  // Anchor captured at receipt so we don't trust device clock alignment.
  const anchorRef = useRef<{ key: string; local: number; elapsedAtArrival: number } | null>(
    null,
  );

  if (
    turn &&
    (!anchorRef.current ||
      anchorRef.current.local < turn.startedAt - 5_000 ||
      anchorRef.current.key !== `${turn.startedAt}:${turn.durationMs}`)
  ) {
    const now = Date.now();
    anchorRef.current = {
      key: `${turn.startedAt}:${turn.durationMs}`,
      local: now,
      elapsedAtArrival: Math.max(0, Math.min(turn.durationMs, now - turn.startedAt)),
    };
  }

  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!active || !turn) return;
    const id = setInterval(() => forceTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [active, turn?.startedAt, turn?.durationMs]);

  if (!turn || !active) return { remainingMs: 0, expired: false };

  const anchor = anchorRef.current!;
  const elapsed =
    anchor.elapsedAtArrival + Math.max(0, Date.now() - anchor.local);
  return {
    remainingMs: Math.max(0, turn.durationMs - elapsed),
    expired: elapsed >= turn.durationMs,
  };
}
