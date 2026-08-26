import { describe, expect, it } from "vitest";
import { MAX_ROOM_SIZE } from "../types/room";
import type { Room } from "../types/room";
import { canJoinRoom } from "../game/validation";

function roomWith(n: number): Room {
  return {
    id: "TEST01",
    hostId: "p0",
    status: "waiting",
    createdAt: 0,
    lastActivityAt: 0,
    players: Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      teamIndex: null,
      isHost: i === 0,
      connected: true,
    })),
  };
}

describe("room limits", () => {
  it("allows joins while below the cap (rooms of 1–7 accept an 8th)", () => {
    for (let n = 1; n < MAX_ROOM_SIZE; n++) {
      expect(canJoinRoom(roomWith(n)).ok).toBe(true);
    }
  });

  it("rejects the 9th player", () => {
    // A full 8-player room rejects the next join.
    const result = canJoinRoom(roomWith(MAX_ROOM_SIZE));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/max 8/i);
  });

  it("exports the shared maximum", () => {
    expect(MAX_ROOM_SIZE).toBe(8);
  });
});
