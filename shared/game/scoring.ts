import type { Difficulty } from "../types/game";
import { POINT_RANGES } from "../types/game";

/**
 * Adaptive point scoring ported (simplified but faithful) from the existing
 * web backend `getAdaptivePoints()` in server.js. Deterministic except where
 * randomness is explicitly injected, so tests can assert exact values.
 */

const EXTREMELY_EASY = new Set([
  "cup",
  "car",
  "cat",
  "dog",
  "bed",
  "pen",
  "hat",
  "map",
  "key",
  "sun",
  "moon",
  "egg",
  "ball",
  "book",
  "chair",
  "table",
  "fork",
  "spoon",
  "mug",
]);

export function applyAdaptivePoints(
  rawWord: string,
  difficulty: Difficulty,
  rand: () => number = Math.random,
): number {
  const range = POINT_RANGES[difficulty];
  const lower = (rawWord || "").toLowerCase();
  const normalized = lower.replace(/["'.,!?():;/\\[\]_]/g, "");
  const lettersOnly = normalized.replace(/\s+/g, "").replace(/[^a-z]/g, "");
  const len = lettersOnly.length;

  let score = range.min;

  if (EXTREMELY_EASY.has(lettersOnly)) return range.min;

  if (normalized.includes(" ")) score -= 1;

  if (len <= 3) score += 0;
  else if (len <= 5) score += 1;
  else if (len <= 8) score += 2;
  else if (len <= 11) score += 3;
  else score += 5;

  const syllables = (lettersOnly.match(/[aeiouy]{1,2}/g) || []).length || 1;
  score += Math.max(0, syllables - 1);

  if (lettersOnly.length <= 2) score = range.min;

  if (difficulty === "medium") {
    score += 2;
    if (/[qxzj]/.test(lettersOnly)) score += 1;
  }

  // Small deterministic-ish variance bounded within range.
  score += Math.floor(rand() * 2);

  score = Math.round(score);
  return Math.min(range.max, Math.max(range.min, score));
}

/** Normalize a typed guess / stored word for comparison. */
export function normalizeGuess(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Case/punctuation-insensitive correctness check. */
export function isCorrectGuess(guess: string, target: string): boolean {
  const g = normalizeGuess(guess);
  const t = normalizeGuess(target);
  return g.length > 0 && g === t;
}
