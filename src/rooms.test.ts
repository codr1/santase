import { describe, expect, test } from "bun:test";
import { createRoom, deleteRoom, getRoom, getRoomsCount, normalizeRoomCode } from "./rooms";

describe("rooms storage", () => {
  test("createRoom stores a room retrievable via getRoom", () => {
    const room = createRoom();

    try {
      const fetched = getRoom(room.code);
      expect(fetched).toBe(room);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("getRoomsCount reflects room creation and deletion", () => {
    const initialCount = getRoomsCount();
    const room = createRoom();

    try {
      expect(getRoomsCount()).toBe(initialCount + 1);
    } finally {
      deleteRoom(room.code);
    }

    expect(getRoomsCount()).toBe(initialCount);
  });

  test("getRoom metadata distinguishes missing from expired rooms", () => {
    const missingLookup = getRoom("never-existed", { includeMetadata: true });
    expect(missingLookup.status).toBe("missing");

    const room = createRoom();
    deleteRoom(room.code);

    const expiredLookup = getRoom(room.code, { includeMetadata: true });
    expect(expiredLookup.status).toBe("expired");
  });

  test("normalizeRoomCode handles whitespace, casing, and O/0 substitution", () => {
    const cases = [
      { input: " abcd ", expected: "ABCD" },
      { input: "aBcD", expected: "ABCD" },
      { input: " o0oO ", expected: "0000" },
      { input: " 0oOo1 ", expected: "00001" },
    ];

    for (const { input, expected } of cases) {
      expect(normalizeRoomCode(input)).toBe(expected);
    }
  });

  test("getRoom expects callers to normalize room codes", () => {
    let room;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const candidate = createRoom();
      if (candidate.code.includes("0") && /[A-Z]/.test(candidate.code)) {
        room = candidate;
        break;
      }
      deleteRoom(candidate.code);
    }

    if (!room) {
      throw new Error("Unable to create room code containing 0 for test");
    }

    try {
      const userInput = room.code.toLowerCase().replace("0", "o");
      expect(getRoom(userInput)).toBeUndefined();
      expect(getRoom(normalizeRoomCode(userInput))).toBe(room);
    } finally {
      deleteRoom(room.code);
    }
  });
});
