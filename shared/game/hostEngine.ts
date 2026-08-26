/**
 * Host-authoritative Taboo game engine.
 *
 * Pure TypeScript, platform independent (no DOM / RN / Node APIs), fully
 * deterministic given injected clock + rng — which makes it unit-testable.
 *
 * The engine never touches a network API. It consumes commands and returns
 * outbound messages; the host transport layer delivers them:
 *
 *   cmd ──► HostGameEngine ──► Outbound[] ──► DataChannels
 */
import type { Player, PlayerId } from "../types/player";
import {
  createGameState,
  isTurnExpired,
  WORDS_PER_TURN,
  SKIP_PENALTY,
} from "../types/game";
import type { GameState, WordCard } from "../types/game";
import { MAX_ROOM_SIZE } from "../types/room";
import type { GameCommand } from "../networking/events";
import { gameEvent, targetedGameEvent } from "../networking/protocol";
import type { GameEventMessage, GameWireMessage } from "../networking/protocol";
import {
  toPlayerInfo,
  type GameStartedEvt,
  type GameEvent,
  type NextCardEvt,
  type PlayerInfo,
  type RoundEndedEvt,
  type RoundStartedEvt,
  type TurnEndedEvt,
} from "../networking/events";
import { isCorrectGuess } from "./scoring";
import type { WordDeck } from "../words/wordSource";

export interface Outbound {
  /** "all" = broadcast to every connected guest. */
  to: "all" | PlayerId;
  msg: GameWireMessage;
}

export type HostPlayer = Player;

export interface HostEngineOptions {
  maxRounds?: number;
  turnTimeS?: number;
  now?: () => number;
}

function evtMsg(evt: GameEvent): GameEventMessage {
  return gameEvent(evt);
}

export class HostGameEngine {
  readonly hostId: PlayerId;
  state: GameState;
  players = new Map<PlayerId, HostPlayer>();

  private deck: WordDeck | null = null;
  private turnQueue: WordCard[] = [];
  private turnCount = 0;
  private now: () => number;

  constructor(
    hostId: PlayerId,
    hostName: string,
    deck: WordDeck | null,
    opts: HostEngineOptions = {},
  ) {
    this.hostId = hostId;
    this.now = opts.now ?? (() => Date.now());
    this.state = createGameState({
      maxRounds: opts.maxRounds,
      turnTimeS: opts.turnTimeS,
    });
    this.deck = deck;
    this.addPlayer(hostId, hostName);
    this.players.get(hostId)!.isHost = true;
  }

  // ---------- Roster ----------

  addPlayer(id: PlayerId, name: string): Outbound[] {
    const existing = this.players.get(id);
    if (existing) {
      existing.name = name;
      existing.connected = true;
    } else {
      if (this.players.size >= MAX_ROOM_SIZE) {
        return [
          {
            to: id,
            msg: evtMsg({
              type: "ERROR",
              code: "ROOM_FULL",
              message: `Room is full (max ${MAX_ROOM_SIZE} players)`,
            }),
          },
        ];
      }
      const player: HostPlayer = {
        id,
        name,
        teamIndex: null,
        isHost: false,
        connected: true,
      };
      this.players.set(id, player);
      this.autoAssignTeam(player);
    }

    const out: Outbound[] = [
      {
        to: "all",
        msg: evtMsg({
          type: "PEER_JOINED",
          player: this.infoOf(id),
          players: this.roster(),
        }),
      },
    ];
    // Late joiner / reconnector gets a targeted snapshot.
    out.push({ to: id, msg: this.buildSyncStateFor(id) });
    return out;
  }

  removePlayer(id: PlayerId): Outbound[] {
    const player = this.players.get(id);
    if (!player) return [];

    for (const team of this.state.teams) {
      const idx = team.playerIds.indexOf(id);
      if (idx !== -1) team.playerIds.splice(idx, 1);
    }
    this.players.delete(id);

    const out: Outbound[] = [
      {
        to: "all",
        msg: evtMsg({
          type: "PEER_LEFT",
          playerId: id,
          players: this.roster(),
        }),
      },
    ];

    if (this.state.status === "playing") {
      const describerLeft =
        this.state.describerId === id && this.state.turnActive;
      if (
        this.state.teams[0].playerIds.length === 0 ||
        this.state.teams[1].playerIds.length === 0
      ) {
        out.push(...this.finishGame());
        return out;
      }
      if (describerLeft) {
        out.push(...this.endTurn("manual"));
      }
    }
    return out;
  }

  setTeam(id: PlayerId, teamIndex: 0 | 1): Outbound[] {
    const player = this.players.get(id);
    if (!player || this.state.status === "playing") return [];
    // Remove from other team, add to requested.
    this.state.teams.forEach((t, i) => {
      const pos = t.playerIds.indexOf(id);
      if (pos !== -1 && i !== teamIndex) t.playerIds.splice(pos, 1);
    });
    if (!this.state.teams[teamIndex].playerIds.includes(id)) {
      this.state.teams[teamIndex].playerIds.push(id);
    }
    player.teamIndex = teamIndex;
    return [
      {
        to: "all",
        msg: evtMsg({
          type: "PEER_JOINED",
          player: this.infoOf(id),
          players: this.roster(),
        }),
      },
    ];
  }

  // ---------- Game flow ----------

  startGame(requesterId: PlayerId): Outbound[] {
    if (requesterId !== this.hostId) {
      return [
        {
          to: requesterId,
          msg: evtMsg({
            type: "ERROR",
            code: "NOT_HOST",
            message: "Only the host can start the game",
          }),
        },
      ];
    }
    if (
      this.state.status === "playing" &&
      this.state.teams[0].playerIds.length > 0 &&
      this.state.teams[1].playerIds.length > 0
    ) {
      return []; // already running
    }
    if (
      this.state.teams.every((t) => t.playerIds.length > 0) === false &&
      this.state.status !== "playing"
    ) {
      if (this.state.teams[0].playerIds.length === 0 || this.state.teams[1].playerIds.length === 0) {
        return [
          {
            to: requesterId,
            msg: evtMsg({
              type: "ERROR",
              code: "GAME_NOT_ACTIVE",
              message: "Both teams need at least one player",
            }),
          },
        ];
      }
    }

    // Reset scores but keep rosters.
    this.state.teams.forEach((t) => (t.score = 0));
    this.state.round = 0;
    this.turnCount = 0;
    this.state.winnerTeamIndex = null;
    this.state.revealedCards = [];
    this.state.status = "playing";

    const started: GameStartedEvt = {
      type: "GAME_STARTED",
      teams: [
        { name: this.state.teams[0].name, score: 0 },
        { name: this.state.teams[1].name, score: 0 },
      ],
      maxRounds: this.state.maxRounds,
    };

    return [{ to: "all", msg: evtMsg(started) }, ...this.beginTurn()];
  }

  handleCommand(cmd: GameCommand): Outbound[] {
    switch (cmd.type) {
      case "JOIN_TEAM":
        return this.setTeam(cmd.playerId, cmd.teamIndex);
      case "START_GAME":
        return this.startGame(cmd.playerId);
      case "READY":
      case "LEAVE_ROOM":
        return cmd.type === "LEAVE_ROOM" ? this.removePlayer(cmd.playerId) : [];
      case "GUESS":
        return this.handleGuess(cmd.playerId, cmd.value);
      case "SKIP":
        return this.handleSkip(cmd.playerId);
      case "END_TURN":
        if (cmd.playerId !== this.state.describerId || !this.state.turnActive) {
          return [];
        }
        return this.endTurn("manual");
      default:
        return [];
    }
  }

  private handleGuess(playerId: PlayerId, value: string): Outbound[] {
    const player = this.players.get(playerId);
    if (!player || !this.state.turnActive || !this.state.currentCard) {
      return [];
    }
    const onCurrentTeam =
      this.state.currentTeamIndex === player.teamIndex &&
      this.state.teams[this.state.currentTeamIndex].playerIds.includes(playerId);
    if (!onCurrentTeam || playerId === this.state.describerId) return [];

    const card = this.state.currentCard;
    const correct = isCorrectGuess(value, card.word);
    let pointsAwarded = 0;
    if (correct) {
      pointsAwarded = card.points;
      this.state.teams[this.state.currentTeamIndex].score += pointsAwarded;
      this.state.revealedCards.push(card);
    }

    const guessResult: Outbound = {
      to: "all",
      msg: evtMsg({
        type: "GUESS_RESULT",
        playerId,
        value,
        correct,
        pointsAwarded,
        teamScores: this.scores(),
        revealedWord: correct ? card.word : undefined,
      }),
    };

    if (!correct) return [guessResult];

    this.state.currentCard = null;
    this.turnQueue.shift(); // consumed
    const next = this.nextCardOutbound("correct", playerId, pointsAwarded);
    return [guessResult, ...next];
  }

  private handleSkip(playerId: PlayerId): Outbound[] {
    if (!this.state.turnActive) return [];
    if (playerId !== this.state.describerId) {
      return [
        {
          to: playerId,
          msg: evtMsg({
            type: "ERROR",
            code: "NOT_DESCRIBER",
            message: "Only the describer can skip",
          }),
        },
      ];
    }
    this.state.teams[this.state.currentTeamIndex].score += SKIP_PENALTY;
    this.state.skippedCount++;
    this.state.currentCard = null;
    this.turnQueue.shift();
    const next = this.nextCardOutbound("skip", playerId);
    return next.length > 0 ? next : [...this.endTurn("deck_exhausted")];
  }

  /**
   * Advance timer-driven state. The host app calls this on an interval
   * (~1s); no network traffic occurs unless the turn expires.
   */
  tick(): Outbound[] {
    if (!this.state.turnActive) return [];
    if (isTurnExpired(this.state, this.now())) {
      return this.endTurn("time");
    }
    return [];
  }

  // ---------- Internal turn machinery ----------

  private beginTurn(): Outbound[] {
    const round = Math.floor(this.turnCount / 2) + 1;
    this.state.round = round;
    this.state.currentTeamIndex = (this.turnCount % 2) as 0 | 1;
    const team = this.state.teams[this.state.currentTeamIndex];
    if (team.playerIds.length === 0) {
      // Other team takes over (defensive; empty teams end game in removePlayer).
      this.turnCount++;
      return this.beginTurn();
    }
    const rotationIdx = Math.floor(this.turnCount / 2) % team.playerIds.length;
    const describerId = team.playerIds[rotationIdx];
    if (!describerId) {
      this.turnCount++;
      return this.beginTurn();
    }
    this.state.describerId = describerId;
    this.state.skippedCount = 0;

    this.turnQueue =
      this.deck?.drawTurn(WORDS_PER_TURN) ?? [];
    const firstCard = this.turnQueue[0] ?? null;
    this.state.currentCard = firstCard;
    this.state.turnActive = true;
    this.state.turnStartedAt = this.now();

    const base: RoundStartedEvt = {
      type: "ROUND_STARTED",
      round,
      startedAt: this.state.turnStartedAt,
      durationMs: this.state.turnDurationMs,
      currentTeamIndex: this.state.currentTeamIndex,
      describerId,
      cardHidden: true,
    };
    const out: Outbound[] = [{ to: "all", msg: evtMsg(base) }];
    if (firstCard && this.state.describerId) {
      out.push({
        to: this.state.describerId,
        msg: targetedGameEvent(
          { ...base, card: firstCard, cardHidden: undefined },
          this.state.describerId,
        ),
      });
    }
    return out;
  }

  /**
   * Card change mid-turn: hidden copy to everyone, full card only to the
   * describer's channel. Hidden information stays on the host.
   */
  private nextCardOutbound(
    reason: "correct" | "skip",
    playerId: PlayerId,
    pointsAwarded?: number,
  ): Outbound[] {
    const nextCard = this.turnQueue[0] ?? null;
    if (!nextCard) return [];
    this.state.currentCard = nextCard;

    const base: NextCardEvt = {
      type: "NEXT_CARD",
      reason,
      playerId,
      pointsAwarded,
      penalty: reason === "skip" ? SKIP_PENALTY : undefined,
      teamScores: this.scores(),
      cardHidden: true,
    };
    const out: Outbound[] = [{ to: "all", msg: evtMsg(base) }];
    if (this.state.describerId) {
      out.push({
        to: this.state.describerId,
        msg: targetedGameEvent(
          { ...base, card: nextCard, cardHidden: undefined },
          this.state.describerId,
        ),
      });
    }
    return out;
  }

  private endTurn(reason: TurnEndedEvt["reason"]): Outbound[] {
    this.state.turnActive = false;
    this.state.turnStartedAt = null;
    this.state.currentCard = null;
    const endedTeam = this.state.currentTeamIndex;

    const out: Outbound[] = [
      {
        to: "all",
        msg: evtMsg({
          type: "TURN_ENDED",
          teamIndex: endedTeam,
          reason,
          teamScores: this.scores(),
        } satisfies TurnEndedEvt),
      },
    ];

    this.turnCount++;
    const nextRound = Math.floor(this.turnCount / 2) + 1;

    if (nextRound > this.state.maxRounds) {
      out.push(...this.finishGame());
      return out;
    }

    out.push({
      to: "all",
      msg: evtMsg({ type: "ROUND_ENDED", round: this.state.round } as RoundEndedEvt),
    });

    // Auto-chain into the next turn — keeps hosts dumb, engine authoritative.
    out.push(...this.beginTurn());
    return out;
  }

  private finishGame(): Outbound[] {
    this.state.status = "finished";
    this.state.turnActive = false;
    const [s0, s1] = this.scores();
    this.state.winnerTeamIndex = s0 === s1 ? null : s0 > s1 ? 0 : 1;
    return [
      {
        to: "all",
        msg: evtMsg({
          type: "GAME_ENDED",
          winnerTeamIndex: this.state.winnerTeamIndex,
          teamScores: this.scores(),
          revealedCards: this.state.revealedCards,
        }),
      },
    ];
  }

  // ---------- Helpers ----------

  private autoAssignTeam(player: HostPlayer): void {
    const smaller =
      this.state.teams[1].playerIds.length < this.state.teams[0].playerIds.length
        ? 1
        : 0;
    player.teamIndex = smaller as 0 | 1;
    this.state.teams[smaller].playerIds.push(player.id);
  }

  private scores(): [number, number] {
    return [this.state.teams[0].score, this.state.teams[1].score];
  }

  private infoOf(id: PlayerId): PlayerInfo {
    const p = this.players.get(id)!;
    return toPlayerInfo(p);
  }

  private roster(): PlayerInfo[] {
    return [...this.players.values()].map(toPlayerInfo);
  }

  buildSyncStateFor(forPlayerId: PlayerId): GameWireMessage {
    const isDescriber = forPlayerId === this.state.describerId;
    const snap = {
      type: "SYNC_STATE" as const,
      status: this.state.status as "lobby" | "playing" | "finished",
      round: this.state.round,
      maxRounds: this.state.maxRounds,
      teams: [
        { name: this.state.teams[0].name, score: this.state.teams[0].score },
        { name: this.state.teams[1].name, score: this.state.teams[1].score },
      ] as [{ name: string; score: number }, { name: string; score: number }],
      playerLists: [
        [...this.state.teams[0].playerIds],
        [...this.state.teams[1].playerIds],
      ] as [string[], string[]],
      currentTeamIndex: this.state.currentTeamIndex,
      describerId: this.state.describerId,
      turnStartedAt: this.state.turnStartedAt,
      turnDurationMs: this.state.turnDurationMs,
      turnActive: this.state.turnActive,
      winnerTeamIndex: this.state.winnerTeamIndex,
      revealedCards: this.state.revealedCards,
      ...(isDescriber && this.state.currentCard
        ? { card: this.state.currentCard }
        : {}),
    };
    return targetedGameEvent(snap, forPlayerId);
  }
}
