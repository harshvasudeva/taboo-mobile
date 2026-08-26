import { describe, expect, it } from "vitest";
import { generateTurnDistribution, shuffle } from "../game/rounds";

describe("rounds", () => {
  it("single-difficulty decks put everything in one bucket", () => {
    const d = generateTurnDistribution(10, ["hard"]);
    expect(d.hard).toBe(10);
  });

  it("full four-difficulty deck splits ~30/30/25/rest and sums exactly", () => {
    const d = generateTurnDistribution(10, ["easy", "medium", "hard", "insane"]);
    const sum = d.easy! + d.medium! + d.hard! + d.insane!;
    expect(sum).toBe(10);
    expect(d.easy!).toBe(3);
    expect(d.medium!).toBe(3);
    expect(d.hard!).toBe(3); // rounding remainder lands on insane
    expect(d.insane!).toBe(1);
  });

  it("two difficulties split evenly with remainder on last", () => {
    const d = generateTurnDistribution(7, ["easy", "insane"]);
    expect(d.easy!).toBe(3);
    expect(d.insane!).toBe(4);
  });

  it("handles zero available difficulties", () => {
    expect(generateTurnDistribution(5, [])).toEqual({});
  });

  it("shuffle preserves elements", () => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffle(src, () => 0.42);
    expect([...out].sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5]); // input untouched
  });
});
