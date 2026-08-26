/**
 * Client view-model reducer. BOTH host and guest UIs render from this,
 * fed by the exact same GameEvent stream — one rendering path everywhere.
 *
 * Guests receive events over WebRTC; the host feeds it its own engine output.
 * Hidden information stays hidden: `card` is populated only when an event
 * carrying a card was addressed to this player (describer) or the word was
 * publicly revealed.
 */
import type { WordCard } from "../types/game";
import type { PlayerId } from "../types/player";
import type { GameWireMessage } from "../networking/protocol";
import type {
  GameEvent,
  PlayerInfo,
} from "../networking/events";

export interface TeamView {
  name: string;
  score: number;
  members: PlayerInfo[];
}

export interface GuessFeedItem {
  key: number;
  playerId: PlayerId;
  value: string;
  correct: boolean;
  pointsAwarded?: number;
}

export interface GameView {
  phase: "lobby" | "playing" | "game_over";
  round: number;
  maxRounds: number;
  teams: [TeamView, TeamView];
  unassigned: PlayerInfo[];
  currentTeamIndex: 0 | 1;
  describerId: PlayerId | null;
  /** Populated ONLY for the describer (or after public reveal). */
  card: WordCard | null;
  turn: { startedAt: number; durationMs: number } | null;
  feed: GuessFeedItem[];
  revealedWords: string[];
  winnerTeamIndex: 0 | 1 | null;
  lastTurnEndReason: "time" | "manual" | "deck_exhausted" | null;
}

let feedCounter = 0;

export function initialGameView(): GameView {
  return {
    phase: "lobby",
    round: 0,
    maxRounds: 6,
    teams: [
      { name: "Team 1", score: 0, members: [] },
      { name: "Team 2", score: 0, members: [] },
    ],
    unassigned: [],
    currentTeamIndex: 0,
    describerId: null,
    card: null,
    turn: null,
    feed: [],
    revealedWords: [],
    winnerTeamIndex: null,
    lastTurnEndReason: null,
  };
}

/** Pure event application. Always returns a NEW view object on change. */
export function applyGameEvent(
  prev: GameView,
  msg: GameWireMessage,
  meId: PlayerId,
): GameView {
  if (msg.kind !== "game") return prev;
  if (!("evt" in msg)) return prev; // GameCommandMessage — no state mutation

  const evt = msg.evt as GameEvent & { to?: PlayerId };
  const v: GameView = { ...prev };

  const regroupRoster = (players: PlayerInfo[]) => {
    v.teams = [
      { ...prev.teams[0], members: [] },
      { ...prev.teams[1], members: [] },
    ];
    v.unassigned = [];
    for (const p of players) {
      if (p.teamIndex === 0) v.teams[0].members.push(p);
      else if (p.teamIndex === 1) v.teams[1].members.push(p);
      else v.unassigned.push(p);
    }
  };

  switch (evt.type) {
    case "PEER_JOINED":
      regroupRoster(evt.players);
      break;

    case "PEER_LEFT":
      regroupRoster(evt.players);
      break;

    case "GAME_STARTED":
      v.phase = "playing";
      v.maxRounds = evt.maxRounds;
      v.round = 1;
      v.teams = [
        { ...v.teams[0], score: evt.teams[0].score },
        { ...v.teams[1], score: evt.teams[1].score },
      ];
      v.feed = [];
      v.revealedWords = [];
      v.winnerTeamIndex = null;
      break;

    case "ROUND_STARTED": {
      v.phase = "playing";
      v.lastTurnEndReason = null;
      v.round = evt.round;
      v.currentTeamIndex = evt.currentTeamIndex;
      v.describerId = evt.describerId;
      v.turn = { startedAt: evt.startedAt, durationMs: evt.durationMs };
      v.card = null;
      if (evt.card) {
        // Targeted copy addressed to me ⇒ I am the describer.
        v.card = evt.card;
      }
      break;
    }

    case "NEXT_CARD":
      v.teams = [
        { ...v.teams[0], score: evt.teamScores[0] },
        { ...v.teams[1], score: evt.teamScores[1] },
      ];
      v.card = evt.card ?? null;
      break;

    case "GUESS_RESULT":
      v.feed = [
        ...v.feed.slice(-30),
        {
          key: ++feedCounter,
          playerId: evt.playerId,
          value: evt.correct ? String(evt.revealedWord ?? "") : evt.value,
          correct: evt.correct,
          pointsAwarded: evt.pointsAwarded,
        },
      ];
      if (evt.correct && evt.revealedWord) {
        v.revealedWords = [...v.revealedWords, evt.revealedWord];
        v.teams = [
          { ...v.teams[0], score: evt.teamScores[0] },
          { ...v.teams[1], score: evt.teamScores[1] },
        ];
        if (evt.playerId === meId || v.describerId === meId) {
          /* card already visible or irrelevant */
        }
      }
      break;

    case "SYNC_STATE": {
      v.phase =
        evt.status === "lobby"
          ? "lobby"
          : evt.status === "finished"
            ? "game_over"
            : "playing";
      v.round = evt.round;
      v.maxRounds = evt.maxRounds;
      v.winnerTeamIndex = evt.winnerTeamIndex;
      v.describerId = evt.describerId;
      v.currentTeamIndex = evt.currentTeamIndex;
      v.turn = evt.turnActive
        ? { startedAt: evt.turnStartedAt ?? Date.now(), durationMs: evt.turnDurationMs }
        : null;
      v.card = evt.card ?? null;
      v.teams = [
        { ...v.teams[0], score: evt.teams[0].score },
        { ...v.teams[1], score: evt.teams[1].score },
      ];
      v.revealedWords = evt.revealedCards.map((c) => c.word);
      break;
    }

    case "TURN_ENDED":
      v.turn = null;
      v.card = null;
      v.lastTurnEndReason = evt.reason;
      v.teams = [
        { ...v.teams[0], score: evt.teamScores[0] },
        { ...v.teams[1], score: evt.teamScores[1] },
      ];
      break;

    case "GAME_ENDED":
      v.phase = "game_over";
      v.winnerTeamIndex = evt.winnerTeamIndex;
      v.turn = null;
      v.card = null;
      v.teams = [
        { ...v.teams[0], score: evt.teamScores[0] },
        { ...v.teams[1], score: evt.teamScores[1] },
      ];
      break;

    default:
      return prev;
  }

  void meId;
  return v;
}
