import type { Difficulty } from "../types/game";

/**
 * Card distribution per turn, adapted from the web backend's
 * `generatePackDistribution()` (server.js). Keeps both teams' batches
 * statistically equivalent without shipping distributions over the wire.
 */
export type Distribution = Partial<Record<Difficulty, number>>;

export function generateTurnDistribution(
  wordsPerBatch: number,
  availableDifficulties: Difficulty[],
): Distribution {
  const dist: Distribution = {};

  if (availableDifficulties.length === 0) return dist;

  if (availableDifficulties.length === 1) {
    dist[availableDifficulties[0]] = wordsPerBatch;
    return dist;
  }

  if (availableDifficulties.length >= 4) {
    // Full deck: 30% easy, 30% medium, 25% hard, rest insane.
    dist.easy = Math.round(wordsPerBatch * 0.3);
    dist.medium = Math.round(wordsPerBatch * 0.3);
    dist.hard = Math.round(wordsPerBatch * 0.25);
    dist.insane =
      wordsPerBatch - (dist.easy ?? 0) - (dist.medium ?? 0) - (dist.hard ?? 0);
    return dist;
  }

  // Two/three difficulties: even split, last bucket takes the remainder.
  const per = Math.floor(wordsPerBatch / availableDifficulties.length);
  let remaining = wordsPerBatch;
  availableDifficulties.forEach((d, i) => {
    if (i === availableDifficulties.length - 1) {
      dist[d] = remaining;
    } else {
      dist[d] = per;
      remaining -= per;
    }
  });
  return dist;
}

export function shuffle<T>(arr: readonly T[], rand: () => number = Math.random): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
