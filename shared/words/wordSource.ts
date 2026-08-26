import type { Difficulty, WordCard } from "../types/game";
import { applyAdaptivePoints } from "../game/scoring";
import { generateTurnDistribution, shuffle } from "../game/rounds";

/**
 * Local word source for the HOST only.
 *
 * The deck never travels over the network (see docs — security section).
 * Guests bundle the same database locally but only the host instantiates a
 * WordDeck; guests just validate nothing — the host is authoritative.
 */

export interface RawWordDatabase {
  words: Partial<Record<Difficulty | string, string[]>>;
  points?: Partial<Record<Difficulty, { min: number; max: number }>>;
}

const SUPPORTED: Difficulty[] = ["easy", "medium", "hard", "insane"];

export class WordDeck {
  private pools = new Map<Difficulty, WordCard[]>();

  constructor(cardsByDifficulty: Map<Difficulty, WordCard[]>, private rand: () => number = Math.random) {
    for (const [d, cards] of cardsByDifficulty) {
      this.pools.set(d, shuffle(cards, rand));
    }
  }

  get availableDifficulties(): Difficulty[] {
    return [...this.pools.keys()].filter((d) => (this.pools.get(d)?.length ?? 0) > 0);
  }

  get totalRemaining(): number {
    let n = 0;
    this.pools.forEach((cards) => (n += cards.length));
    return n;
  }

  /** Draw `count` cards following the turn distribution; refills when exhausted. */
  drawTurn(count: number): WordCard[] {
    const diffs = this.availableDifficulties;
    const dist = generateTurnDistribution(count, diffs);
    const out: WordCard[] = [];
    for (const d of diffs) {
      const want = dist[d] ?? 0;
      for (let i = 0; i < want; i++) {
        const card = this.drawOne(d);
        if (card) out.push(card);
      }
    }
    return shuffle(out.filter(Boolean), this.rand);
  }

  private drawOne(d: Difficulty): WordCard | null {
    let pool = this.pools.get(d);
    if (!pool || pool.length === 0) {
      // Rebuild pool from a fresh shuffled copy of the full difficulty set.
      pool = this.rebuild(d);
    }
    return pool.pop() ?? null;
  }

  private rebuildCache = new Map<Difficulty, WordCard[]>();

  private rebuild(d: Difficulty): WordCard[] {
    let full = this.rebuildCache.get(d);
    if (!full) {
      full = this.pools.get(d) ? [...this.pools.get(d)!] : [];
      this.rebuildCache.set(d, full);
    }
    const fresh = shuffle(full, this.rand);
    this.pools.set(d, fresh);
    return fresh;
  }
}

/** Build cards + deck from the unified wordDatabase.json shape. */
export function loadWordDatabase(raw: RawWordDatabase, rand: () => number = Math.random): WordDeck {
  const byDiff = new Map<Difficulty, WordCard[]>();
  for (const key of Object.keys(raw.words || {})) {
    if (!(SUPPORTED as string[]).includes(key)) continue;
    const words = raw.words[key] ?? [];
    byDiff.set(
      key as Difficulty,
      words.map((w) => ({
        word: w.toUpperCase(),
        difficulty: key as Difficulty,
        points: applyAdaptivePoints(w, key as Difficulty, rand),
      })),
    );
  }
  return new WordDeck(byDiff, rand);
}
