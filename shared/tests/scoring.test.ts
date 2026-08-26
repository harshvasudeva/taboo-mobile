import { describe, expect, it } from "vitest";
import { applyAdaptivePoints, isCorrectGuess, normalizeGuess } from "../game/scoring";

const rand = () => 0.5;

describe("scoring", () => {
  it("keeps extremely easy words at the minimum", () => {
    expect(applyAdaptivePoints("cat", "easy", () => 0)).toBe(5);
    expect(applyAdaptivePoints("Dog", "easy", () => 0)).toBe(5);
  });

  it("stays inside the difficulty point range", () => {
    for (const w of ["refrigerator", "philanthropist", "extraordinary", "apple pie"]) {
      const p = applyAdaptivePoints(w, "medium", rand);
      expect(p).toBeGreaterThanOrEqual(13);
      expect(p).toBeLessThanOrEqual(25);
    }
    for (const w of ["epistemology", "unbelievable", "characterization"]) {
      const p = applyAdaptivePoints(w, "hard", rand);
      expect(p).toBeGreaterThanOrEqual(26);
      expect(p).toBeLessThanOrEqual(40);
    }
  });

  it("longer words score higher than short ones within a range", () => {
    const short = applyAdaptivePoints("sun hat", "easy", () => 0);
    const long = applyAdaptivePoints("internationalization", "easy", () => 0);
    expect(long).toBeGreaterThan(short);
  });

  describe("normalizeGuess", () => {
    it("is case/punctuation/whitespace insensitive", () => {
      expect(normalizeGuess("  Apple-Pie! ")).toBe("apple pie");
      expect(normalizeGuess("ICE-CREAM")).toBe("ice cream");
    });
  });

  describe("isCorrectGuess", () => {
    it("accepts equivalent spellings", () => {
      expect(isCorrectGuess("Ice Cream", "ice cream")).toBe(true);
      expect(isCorrectGuess("AIRPLANE!", "airplane")).toBe(true);
    });
    it("rejects different words and empty input", () => {
      expect(isCorrectGuess("aeroplane", "airplane")).toBe(false);
      expect(isCorrectGuess("", "airplane")).toBe(false);
      expect(isCorrectGuess("   ", "airplane")).toBe(false);
    });
  });
});
