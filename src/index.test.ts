import { describe, expect, test } from "bun:test";
import { handleRequest, resolvePort } from "./index";
import { createRoom, deleteRoom } from "./rooms";
import type { Card, GameState } from "./game";

const HOST_TOKEN = "host-token";

const buildGameState = (overrides: Partial<GameState> = {}): GameState => {
  const baseState: GameState = {
    playerHands: [[], []],
    stock: [],
    trumpCard: { suit: "hearts", rank: "A" },
    trumpSuit: "hearts",
    isClosed: false,
    leader: 0,
    currentTrick: null,
    closedBy: null,
    wonTricks: [[], []],
    roundScores: [0, 0],
    declaredMarriages: [],
    roundResult: null,
  };

  return {
    ...baseState,
    ...overrides,
    playerHands: overrides.playerHands ?? baseState.playerHands,
    wonTricks: overrides.wonTricks ?? baseState.wonTricks,
    roundScores: overrides.roundScores ?? baseState.roundScores,
    declaredMarriages: overrides.declaredMarriages ?? baseState.declaredMarriages,
  };
};

const createTestRoom = (game: GameState, hostIndex: 0 | 1 = 0) => {
  const room = createRoom();
  room.hostPlayerIndex = hostIndex;
  room.hostToken = HOST_TOKEN;
  room.matchState = {
    game,
    matchScores: [0, 0],
    dealerIndex: hostIndex,
    leaderIndex: game.leader,
  };
  return room;
};

const postPlay = async (roomCode: string, payload: unknown, asHost: boolean) => {
  const hostQuery = asHost ? `?hostToken=${encodeURIComponent(HOST_TOKEN)}` : "";
  return handleRequest(
    new Request(`http://example/rooms/${roomCode}/play${hostQuery}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
};

describe("resolvePort", () => {
  test("defaults to 3000 when env var is missing", () => {
    expect(resolvePort(undefined)).toBe(3000);
  });

  test("parses a numeric port", () => {
    expect(resolvePort("8080")).toBe(8080);
  });

  test("falls back to 3000 on invalid input", () => {
    expect(resolvePort("not-a-port")).toBe(3000);
  });
});

describe("join flow", () => {
  test("creates then joins a room with normalized code", async () => {
    let roomCode: string | undefined;

    for (let attempt = 0; attempt < 200; attempt += 1) {
      const createResponse = await handleRequest(
        new Request("http://example/rooms", { method: "POST" }),
      );
      expect(createResponse.status).toBe(303);

      const location = createResponse.headers.get("location");
      if (!location) {
        throw new Error("Expected room creation redirect location");
      }
      const match = location.match(/^\/rooms\/([^/]+)\/lobby$/);
      if (!match) {
        throw new Error(`Unexpected room creation redirect: ${location}`);
      }

      const code = decodeURIComponent(match[1]);
      if (code.includes("0") && /[A-Z]/.test(code)) {
        roomCode = code;
        break;
      }

      deleteRoom(code);
    }

    if (!roomCode) {
      throw new Error("Unable to create room code containing 0 for test");
    }

    try {
      const userInput = `  ${roomCode.toLowerCase().replaceAll("0", "o")}  `;
      const joinResponse = await handleRequest(
        new Request(`http://example/rooms?code=${encodeURIComponent(userInput)}`),
      );

      expect(joinResponse.status).toBe(303);
      expect(joinResponse.headers.get("location")).toBe(
        `/rooms/${encodeURIComponent(roomCode)}`,
      );
    } finally {
      deleteRoom(roomCode);
    }
  });
});

describe("play endpoint", () => {
  test("allows the leader to lead a card", async () => {
    const leadCard: Card = { suit: "hearts", rank: "K" };
    const game = buildGameState({
      playerHands: [[leadCard], [{ suit: "spades", rank: "9" }]],
      leader: 0,
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postPlay(room.code, { card: leadCard }, true);
      expect(response.status).toBe(200);

      const nextGame = room.matchState.game;
      expect(nextGame.currentTrick?.leaderIndex).toBe(0);
      expect(nextGame.currentTrick?.leaderCard).toEqual(leadCard);
      expect(nextGame.playerHands[0]).toHaveLength(0);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("rejects a lead from the non-leader", async () => {
    const leadCard: Card = { suit: "clubs", rank: "Q" };
    const game = buildGameState({
      playerHands: [[leadCard], [{ suit: "spades", rank: "9" }]],
      leader: 0,
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postPlay(room.code, { card: leadCard }, false);
      expect(response.status).toBe(409);
      expect(room.matchState.game.currentTrick).toBeNull();
    } finally {
      deleteRoom(room.code);
    }
  });

  test("declares a marriage when leading with a king or queen", async () => {
    const kingOfHearts: Card = { suit: "hearts", rank: "K" };
    const queenOfHearts: Card = { suit: "hearts", rank: "Q" };
    const game = buildGameState({
      playerHands: [[kingOfHearts, queenOfHearts], [{ suit: "spades", rank: "9" }]],
      leader: 0,
      trumpSuit: "hearts",
      trumpCard: { suit: "hearts", rank: "A" },
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postPlay(
        room.code,
        { card: kingOfHearts, marriageSuit: "hearts" },
        true,
      );
      expect(response.status).toBe(200);

      const nextGame = room.matchState.game;
      expect(nextGame.declaredMarriages).toContain("hearts");
      expect(nextGame.roundScores[0]).toBe(40);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("accepts the deprecated marriage field", async () => {
    const kingOfHearts: Card = { suit: "hearts", rank: "K" };
    const queenOfHearts: Card = { suit: "hearts", rank: "Q" };
    const game = buildGameState({
      playerHands: [[kingOfHearts, queenOfHearts], [{ suit: "spades", rank: "9" }]],
      leader: 0,
      trumpSuit: "hearts",
      trumpCard: { suit: "hearts", rank: "A" },
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postPlay(room.code, { card: kingOfHearts, marriage: "hearts" }, true);
      expect(response.status).toBe(200);

      const nextGame = room.matchState.game;
      expect(nextGame.declaredMarriages).toContain("hearts");
      expect(nextGame.roundScores[0]).toBe(40);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("enforces follower rules when the deck is closed", async () => {
    const leaderCard: Card = { suit: "hearts", rank: "A" };
    const followerCard: Card = { suit: "spades", rank: "9" };
    const game = buildGameState({
      playerHands: [[], [{ suit: "hearts", rank: "K" }, followerCard]],
      leader: 0,
      isClosed: true,
      closedBy: 0,
      currentTrick: { leaderIndex: 0, leaderCard },
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postPlay(room.code, { card: followerCard }, false);
      expect(response.status).toBe(400);
      expect(room.matchState.game.playerHands[1]).toHaveLength(2);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("ends the round when the final trick exhausts the hands", async () => {
    const leaderCard: Card = { suit: "hearts", rank: "A" };
    const followerCard: Card = { suit: "hearts", rank: "10" };
    const game = buildGameState({
      playerHands: [[], [followerCard]],
      leader: 0,
      currentTrick: { leaderIndex: 0, leaderCard },
      stock: [],
      trumpCard: null,
      trumpSuit: "spades",
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postPlay(room.code, { card: followerCard }, false);
      expect(response.status).toBe(200);

      const nextGame = room.matchState.game;
      expect(nextGame.roundResult?.reason).toBe("exhausted");
      expect(nextGame.roundResult?.winner).toBe(0);
      expect(room.matchState.matchScores).toEqual([3, 0]);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("awards points to the opponent when the closer fails", async () => {
    const leaderCard: Card = { suit: "diamonds", rank: "A" };
    const followerCard: Card = { suit: "spades", rank: "9" };
    const game = buildGameState({
      playerHands: [[], [followerCard]],
      leader: 0,
      currentTrick: { leaderIndex: 0, leaderCard },
      stock: [],
      trumpCard: null,
      trumpSuit: "clubs",
      isClosed: true,
      closedBy: 0,
      roundScores: [20, 0],
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postPlay(room.code, { card: followerCard }, false);
      expect(response.status).toBe(200);

      const nextGame = room.matchState.game;
      expect(nextGame.roundResult?.reason).toBe("closed_failed");
      expect(nextGame.roundResult?.winner).toBe(1);
      expect(room.matchState.matchScores).toEqual([0, 3]);
    } finally {
      deleteRoom(room.code);
    }
  });
});
