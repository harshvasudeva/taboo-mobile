/**
 * Game-level events exchanged over WebRTC DataChannels.
 *
 * Design rules:
 * - Events are small deltas, never full-state dumps.
 * - Timer is synchronized via ROUND_STARTED {startedAt, durationMs}; no ticks.
 * - Hidden information (future cards, taboo lists) never leaves the host
 *   except the active card to the active describer.
 */
import type { PlayerId } from "../types/player";
import type { WordCard } from "../types/game";

export interface PlayerInfo {
  id: PlayerId;
  name: string;
  teamIndex: 0 | 1 | null;
  isHost: boolean;
}

// ---------- Client → Host commands ----------

export interface ReadyCmd {
  type: "READY";
  playerId: PlayerId;
}
export interface StartGameCmd {
  type: "START_GAME";
  playerId: PlayerId;
}
export interface GuessCmd {
  type: "GUESS";
  playerId: PlayerId;
  value: string;
}
export interface SkipCmd {
  type: "SKIP";
  playerId: PlayerId;
}
export interface EndTurnCmd {
  type: "END_TURN";
  playerId: PlayerId;
}
export interface JoinTeamCmd {
  type: "JOIN_TEAM";
  playerId: PlayerId;
  teamIndex: 0 | 1;
}
export interface LeaveRoomCmd {
  type: "LEAVE_ROOM";
  playerId: PlayerId;
}

export type GameCommand =
  | ReadyCmd
  | StartGameCmd
  | GuessCmd
  | SkipCmd
  | EndTurnCmd
  | JoinTeamCmd
  | LeaveRoomCmd;

// ---------- Host → Guests events ----------

export interface PeerJoinedEvt {
  type: "PEER_JOINED";
  player: PlayerInfo;
  players: PlayerInfo[];
}
export interface PeerLeftEvt {
  type: "PEER_LEFT";
  playerId: PlayerId;
  players: PlayerInfo[];
}
export interface GameStartedEvt {
  type: "GAME_STARTED";
  teams: GameStateView["teams"];
  maxRounds: number;
}
export interface RoundStartedEvt {
  type: "ROUND_STARTED";
  round: number;
  /** Epoch ms on the host clock when the turn started. */
  startedAt: number;
  durationMs: number;
  currentTeamIndex: 0 | 1;
  describerId: PlayerId;
  /**
   * Card payload — only present in messages addressed to the describer.
   * Guessers receive `cardHidden: true` and must not get the word.
   */
  card?: WordCard;
  cardHidden?: boolean;
}
export interface GuessResultEvt {
  type: "GUESS_RESULT";
  playerId: PlayerId;
  value: string;
  correct: boolean;
  pointsAwarded: number;
  teamScores: [number, number];
  /** Set when correct — everyone learns the word at reveal time. */
  revealedWord?: string;
}
/**
 * Emitted whenever the active card changes mid-turn (after a correct guess or
 * a skip). Visibility rules identical to ROUND_STARTED: only the describer's
 * copy carries `card`.
 */
export interface NextCardEvt {
  type: "NEXT_CARD";
  reason: "correct" | "skip";
  playerId: PlayerId;
  /** Only for reason:"correct". */
  pointsAwarded?: number;
  /** Only for reason:"skip". */
  penalty?: number;
  teamScores: [number, number];
  card?: WordCard;
  cardHidden?: boolean;
}
/** Full public-state snapshot for late joiners / reconnects / future migration. */
export interface SyncStateEvt {
  type: "SYNC_STATE";
  status: "lobby" | "playing" | "finished";
  round: number;
  maxRounds: number;
  teams: GameStateView["teams"];
  playerLists: [PlayerId[], PlayerId[]];
  currentTeamIndex: 0 | 1;
  describerId: PlayerId | null;
  turnStartedAt: number | null;
  turnDurationMs: number;
  turnActive: boolean;
  winnerTeamIndex: 0 | 1 | null;
  revealedCards: WordCard[];
  /** Included only when addressed to the current describer. */
  card?: WordCard;
}
export interface TurnEndedEvt {
  type: "TURN_ENDED";
  teamIndex: 0 | 1;
  reason: "time" | "manual" | "deck_exhausted";
  teamScores: [number, number];
}
export interface ScoreUpdateEvt {
  type: "SCORE_UPDATE";
  teamScores: [number, number];
}
export interface RoundEndedEvt {
  type: "ROUND_ENDED";
  round: number;
}
export interface GameEndedEvt {
  type: "GAME_ENDED";
  winnerTeamIndex: 0 | 1 | null;
  teamScores: [number, number];
  revealedCards: WordCard[];
}
/** Reserved for future host migration — protocol stays forward-compatible. */
export interface HostMigratedEvt {
  type: "HOST_MIGRATED";
  newHostId: PlayerId;
  /** Full snapshot so the new host can resume authority. */
  snapshot: unknown;
}
export interface ErrorEvt {
  type: "ERROR";
  code:
    | "ROOM_FULL"
    | "NOT_HOST"
    | "NOT_DESCRIBER"
    | "GAME_NOT_ACTIVE"
    | "TURN_NOT_ACTIVE"
    | "INVALID_COMMAND";
  message: string;
}

export type GameEvent =
  | PeerJoinedEvt
  | PeerLeftEvt
  | GameStartedEvt
  | RoundStartedEvt
  | GuessResultEvt
  | NextCardEvt
  | SyncStateEvt
  | TurnEndedEvt
  | ScoreUpdateEvt
  | RoundEndedEvt
  | GameEndedEvt
  | HostMigratedEvt
  | ErrorEvt;

interface GameStateView {
  teams: [{ name: string; score: number }, { name: string; score: number }];
}

/** Public roster view of a player (no transport-internal fields). */
export function toPlayerInfo(p: {
  id: PlayerId;
  name: string;
  teamIndex: 0 | 1 | null;
  isHost: boolean;
}): PlayerInfo {
  return { id: p.id, name: p.name, teamIndex: p.teamIndex, isHost: p.isHost };
}
