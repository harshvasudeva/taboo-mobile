import { describe, expect, it, beforeEach } from "vitest";
import { HostGameEngine } from "../game/hostEngine";
import type { Outbound } from "../game/hostEngine";
import { WordDeck } from "../words/wordSource";
import type { WordCard } from "../types/game";
import { remainingMs } from "../types/game";
import { electNextHost } from "../types/player";
import { loadWordDatabase } from "../words/wordSource";

/**
 * Deterministic test deck: words whose names encode difficulty.
 * Turn distribution over 4 difficulties for 10 cards ≈ 3/3/3/1.
 */
function makeDeck(): WordDeck {
  const byDiff = new Map<string, WordCard[]>();
  const mk = (d: string, n: number): WordCard[] =>
    Array.from({ length: n }, (_, i) => ({
      word: `${d.toUpperCase()}_WORD_${i}`,
      difficulty: d as WordCard["difficulty"],
      points: 10,
    }));
  byDiff.set("easy", mk("easy", 40));
  byDiff.set("medium", mk("medium", 40));
  byDiff.set("hard", mk("hard", 40));
  byDiff.set("insane", mk("insane", 40));
  return new WordDeck(byDiff as Map<WordCard["difficulty"], WordCard[]>);
}

/** Test harness: collects engine output and indexes events. */
class Harness {
  engine: HostGameEngine;
  sent: Outbound[] = [];
  nowMs = 1_000_000;

  constructor() {
    this.engine = new HostGameEngine("host-1", "Host", makeDeck(), {
      now: () => this.nowMs,
      turnTimeS: 60,
      maxRounds: 2,
    });
  }

  deliver(outs: Outbound[]) {
    this.sent.push(...outs);
  }

  /** Broadcast messages seen by everyone; targeted only to that peer. */
  visibleTo(playerId: string | null): Outbound[] {
    if (playerId === null) return this.sent.filter((o) => o.to === "all");
    return this.sent.filter((o) => o.to === "all" || o.to === playerId);
  }

  lastEventFor(playerId: string | null, type: string) {
    const list = [...this.visibleTo(playerId)].reverse();
    for (const o of list) {
      const m = o.msg as { kind: string; evt?: { type?: string } };
      if (m.kind === "game" && m.evt?.type === type) return m.evt;
    }
    return undefined;
  }

  advanceSeconds(s: number) {
    this.nowMs += s * 1000;
  }
}

describe("host engine — lobby", () => {
  let h: Harness;
  beforeEach(() => {
    h = new Harness();
  });

  it("host is registered automatically and guests join up to the cap", () => {
    h.deliver(h.engine.addPlayer("a", "Alice"));
    h.deliver(h.engine.addPlayer("b", "Bob"));
    expect(h.engine.players.size).toBe(3);
    const joinEvt = h.lastEventFor(null, "PEER_JOINED");
    expect(joinEvt).toBeTruthy();

    // 9th player rejected with ROOM_FULL error targeted at them
    for (let i = 3; i < 8; i++) h.deliver(h.engine.addPlayer(`p${i}`, `P${i}`));
    h.sent.length = 0;
    h.deliver(h.engine.addPlayer("overflow", "Nine"));
    expect(h.engine.players.size).toBe(8);
    expect((h.lastEventFor("overflow", "ERROR") as { code?: string })?.code).toBe("ROOM_FULL");
  });
});

describe("host engine — gameplay", () => {
  let h: Harness;
  beforeEach(() => {
    h = new Harness();
    h.deliver(h.engine.addPlayer("g1", "Alice"));
    h.deliver(h.engine.addPlayer("g2", "Bob"));
    // Balance teams: host + g1 vs g2
    h.deliver(h.engine.setTeam("g1", 0));
    h.deliver(h.engine.setTeam("g2", 1));
    h.sent.length = 0;

    h.deliver(h.engine.startGame("host-1"));
  });

  it("non-host cannot start", () => {
    const h2 = new Harness();
    h2.deliver(h2.engine.addPlayer("x", "X"));
    h2.sent.length = 0;
    h2.deliver(h2.engine.startGame("x"));
    expect((h2.lastEventFor("x", "ERROR") as { code?: string })?.code).toBe("NOT_HOST");
  });

  it("round started broadcast hides the card; describer copy carries it", () => {
    const guestView = h.lastEventFor("g1", "ROUND_STARTED");
    const describerId = (guestView as { describerId?: string }).describerId!;
    const broadcast = h.visibleTo(null).find(
      (o) => (o.msg as { evt?: { type?: string } }).evt?.type === "ROUND_STARTED",
    )!;
    const targeted = h.visibleTo(describerId).find((o) => {
      const m = o.msg as { evt?: { card?: unknown } };
      return m.evt && "card" in m.evt && !!m.evt.card;
    });

    expect((broadcast.msg as { evt: { card?: WordCard } }).evt.card).toBeUndefined();
    expect(targeted).toBeTruthy(); // exactly the describer gets a card payload
    expect(targeted!.to).toBe(describerId);
  });

  it("correct guess awards points, reveals word publicly, advances card", () => {
    // Find who describes turn 0 and force their team to guess correctly.
    const roundStarted = h.lastEventFor(null, "ROUND_STARTED") as unknown as {
      describerId: string;
      currentTeamIndex: 0 | 1;
      card?: never;
    };
    const teamIdx = roundStarted.currentTeamIndex;
    const guesser =
      teamIdx === 0
        ? ["host-1", "g1"].find((id) => id !== roundStarted.describerId)!
        : "g2";

    // Peek current card via engine state (host-side knowledge).
    const target = h.engine.state.currentCard!.word;
    h.sent.length = 0;
    h.deliver(h.engine.handleCommand({ type: "GUESS", playerId: guesser, value: target.toLowerCase() }));

    const result = h.lastEventFor(null, "GUESS_RESULT") as unknown as {
      correct: boolean;
      pointsAwarded: number;
      revealedWord: string;
    };
    expect(result.correct).toBe(true);
    expect(result.pointsAwarded).toBeGreaterThan(0);
    expect(result.revealedWord).toBe(target);
    expect(h.engine.state.teams[teamIdx].score).toBe(result.pointsAwarded);

    // NEXT_CARD broadcast must NOT carry the new word…
    const nextBcast = h
      .visibleTo(null)
      .filter((o) => (o.msg as { evt?: { type?: string } }).evt?.type === "NEXT_CARD")
      .at(-1)!;
    expect((nextBcast.msg as { evt: { card?: WordCard } }).evt.card).toBeUndefined();
    // …but the describer's targeted copy does.
    const nextTargeted = h
      .visibleTo(roundStarted.describerId)
      .filter(
        (o) =>
          o.to !== "all" &&
          (o.msg as { evt?: { type?: string; card?: WordCard } }).evt?.type === "NEXT_CARD",
      )
      .at(-1)!;
    const card = (nextTargeted.msg as { kind: string; evt?: { card?: WordCard } }).evt?.card;
    expect(card!.word).toBeDefined();
  });

  it("wrong guess produces no points", () => {
    const before = h.engine.state.teams[0].score + h.engine.state.teams[1].score;
    h.deliver(h.engine.handleCommand({ type: "GUESS", playerId: "zzz-not-in-team", value: "whatever" }));
    const after = h.engine.state.teams[0].score + h.engine.state.teams[1].score;
    expect(after).toBe(before);
  });

  it("only the describer may skip; skip costs -1", () => {
    const rs = h.lastEventFor(null, "ROUND_STARTED") as unknown as { describerId: string };
    const scoreBefore = [...h.engine.state.teams.map((t) => t.score)];
    h.sent.length = 0;

    h.deliver(h.engine.handleCommand({ type: "SKIP", playerId: "g1" }));
    const denied = h.lastEventFor("g1", "ERROR");
    expect(denied).toBeTruthy();
    expect(h.engine.state.teams.map((t) => t.score)).toEqual(scoreBefore);

    h.sent.length = 0;
    h.deliver(h.engine.handleCommand({ type: "SKIP", playerId: rs.describerId }));
    const skipped = h.lastEventFor(null, "NEXT_CARD") as unknown as { penalty?: number };
    expect(skipped.penalty).toBe(-1);
    // Team total decreased by exactly 1 relative to before (score can't go below via clamp here).
    const after = h.engine.state.teams.reduce((s, t) => s + t.score, 0);
    const beforeTotal = scoreBefore.reduce((s, v) => s + v, 0);
    expect(after).toBe(beforeTotal - 1);
  });

  it("turn expires from local clock ticks without any per-second traffic", () => {
    h.sent.length = 0;
    h.advanceSeconds(61);
    const out = h.engine.tick();
    h.deliver(out);
    const ended = h.lastEventFor(null, "TURN_ENDED") as unknown as { reason?: string };
    expect(ended?.reason).toBe("time");

    // And the next turn auto-started (broadcast ROUND_STARTED present).
    expect(h.lastEventFor(null, "ROUND_STARTED")).toBeTruthy();
    // No timer tick events were ever emitted.
    const tickLike = h.sent.filter((o) => /TICK|TIMER/.test(JSON.stringify(o)));
    expect(tickLike).toHaveLength(0);
  });

  it("plays through all rounds then ends the game with a winner", () => {
    // Exhaust turns quickly: each describer immediately ends their turn.
    for (let i = 0; i < 4; i++) {
      const rs = h.lastEventFor(null, "ROUND_STARTED") as unknown as { describerId: string };
      h.deliver(h.engine.handleCommand({ type: "END_TURN", playerId: rs.describerId }));
    }
    const end = h.lastEventFor(null, "GAME_ENDED") as unknown as {
      winnerTeamIndex: number | null;
      teamScores: [number, number];
    };
    expect(end).toBeTruthy();
    expect(h.engine.state.status).toBe("finished");
    expect(end.winnerTeamIndex === null || [0, 1].includes(end.winnerTeamIndex)).toBe(true);
  });

  it("describer leaving mid-turn ends the turn cleanly", () => {
    const rs = h.lastEventFor(null, "ROUND_STARTED") as unknown as { describerId: string };
    h.deliver(h.engine.removePlayer(rs.describerId));
    const ended = h.lastEventFor(null, "TURN_ENDED") as unknown as { reason?: string };
    expect(ended?.reason).toBe("manual");
  });

  it("emptying a team ends the game", () => {
    // Move everyone possible out of team 1 then remove them.
    const rs = h.lastEventFor(null, "ROUND_STARTED") as unknown as { currentTeamIndex: 0 | 1 };
    void rs;
    // Find team 1 members and remove them all.
    const t1 = [...h.engine.state.teams[1].playerIds];
    for (const id of t1) h.deliver(h.engine.removePlayer(id));
    const end = h.lastEventFor(null, "GAME_ENDED");
    expect(end).toBeTruthy();
  });

  it("late joiner receives SYNC_STATE without hidden cards", () => {
    h.sent.length = 0;
    h.deliver(h.engine.addPlayer("late", "Late"));
    const syncMsg = h.sent.find(
      (o) => o.to === "late" && (o.msg as { evt?: { type?: string } }).evt?.type === "SYNC_STATE",
    );
    expect(syncMsg).toBeTruthy();
    const sync = syncMsg!.msg as { evt: { card?: WordCard; turnActive: boolean } };
    expect(sync.evt.turnActive).toBe(true);
    // Not the describer → no card in snapshot.
    expect(sync.evt.card).toBeUndefined();
  });
});

describe("timer math", () => {
  it("remainingMs counts down and hits zero at expiry", () => {
    const state = {
      turnActive: true,
      turnStartedAt: 1000,
      turnDurationMs: 60_000,
    } as Parameters<typeof remainingMs>[0];
    Object.assign(state, { status: "playing", round: 1 });
    expect(remainingMs(state, 1000)).toBe(60_000);
    expect(remainingMs(state, 31_000)).toBe(30_000);
    expect(remainingMs(state, 999_999)).toBe(0);
  });
});

describe("host election", () => {
  it("chooses the lexicographically lowest stable id", () => {
    expect(electNextHost(["c", "a", "b"])).toBe("a");
    expect(electNextHost([])).toBeNull();
  });
});

describe("word deck loading", () => {
  it("builds cards within point ranges from raw database shape", () => {
    const deck = loadWordDatabase({
      words: { easy: ["cat"], medium: ["refrigerator"], hard: ["epistemology"] },
    });
    expect(deck.availableDifficulties.sort()).toEqual(["easy", "hard", "medium"]);
    expect(deck.drawTurn(3).length).toBe(3);
  });
});
