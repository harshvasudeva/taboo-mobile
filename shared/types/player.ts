/**
 * Player types shared between host, guests, signaling and tests.
 * Platform-independent: no React Native / Node / DOM APIs.
 */

export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
  /** null while unassigned in the lobby. */
  teamIndex: 0 | 1 | null;
  isHost: boolean;
  /** Set once the WebRTC DataChannel to the host is open. */
  connected: boolean;
}

/** Deterministic ordering used for things like host election. */
export function comparePlayerIds(a: PlayerId, b: PlayerId): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Deterministic next-host choice: lowest stable player id among candidates. */
export function electNextHost(candidateIds: PlayerId[]): PlayerId | null {
  if (candidateIds.length === 0) return null;
  return [...candidateIds].sort(comparePlayerIds)[0];
}
