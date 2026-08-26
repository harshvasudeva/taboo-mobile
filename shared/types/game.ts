import type { PlayerId } from "./player";

export type Difficulty = "easy" | "medium" | "hard" | "insane";

/** A single card as stored in the word database. Taboo lists are optional. */
export interface WordCard {
  word: string;
  difficulty: Difficulty;
  points: number;
  taboo?: string[];
}

/** Point ranges per difficulty (mirrors wordDatabase.json). */
export const POINT_RANGES: Record<Difficulty, { min: number; max: number }> = {
  easy: { min: 5, max: 12 },
  medium: { min: 13, max: 25 },
  hard: { min: 26, max: 40 },
  insane: { min: 41, max: 60 },
};

export const DEFAULT_TURN_TIME_S = 60;
export const DEFAULT_MAX_ROUNDS = 6;
export const WORDS_PER_TURN = 10;
export const SKIP_PENALTY = -1;

export interface TeamState {
  name: string;
  playerIds: PlayerId[];
  score: number;
}

/**
 * Authoritative game state, maintained by the host.
 *
 * NOTE: the full deck of words never leaves the host. `currentCard` holds only
 * what the current turn requires, and is transmitted only to peers that are
 * allowed to see it (see protocol.ts / visibility rules).
 */
export interface GameState {
  status: "lobby" | "playing" | "round_break" | "finished";
  round: number;
  maxRounds: number;
  teams: [TeamState, TeamState];
  currentTeamIndex: 0 | 1;
  describerId: PlayerId | null;
  /** Card for the active turn. Hidden from guessers until reveal. */
  currentCard: WordCard | null;
  revealedCards: WordCard[];
  skippedCount: number;
  /** Timer sync fields — clients compute remaining time locally. */
  turnStartedAt: number | null;
  turnDurationMs: number;
  turnActive: boolean;
  winnerTeamIndex: 0 | 1 | null;
}

export function createGameState(opts?: {
  maxRounds?: number;
  turnTimeS?: number;
}): GameState {
  return {
    status: "lobby",
    round: 0,
    maxRounds: opts?.maxRounds ?? DEFAULT_MAX_ROUNDS,
    teams: [
      { name: "Team 1", playerIds: [], score: 0 },
      { name: "Team 2", playerIds: [], score: 0 },
    ],
    currentTeamIndex: 0,
    describerId: null,
    currentCard: null,
    revealedCards: [],
    skippedCount: 0,
    turnStartedAt: null,
    turnDurationMs: (opts?.turnTimeS ?? DEFAULT_TURN_TIME_S) * 1000,
    turnActive: false,
    winnerTeamIndex: null,
  };
}

/** Remaining ms in the current turn given a local clock timestamp. */
export function remainingMs(state: GameState, now: number): number {
  if (!state.turnActive || state.turnStartedAt === null) return 0;
  const elapsed = Math.max(0, now - state.turnStartedAt);
  return Math.max(0, state.turnDurationMs - elapsed);
}

export function isTurnExpired(state: GameState, now: number): boolean {
  return state.turnActive && remainingMs(state, now) <= 0;
}
