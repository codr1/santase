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
    lastCompletedTrick: null,
    closedBy: null,
    wonTricks: [[], []],
    roundScores: [0, 0],
    declaredMarriages: [],
    canDeclareWindow: null,
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

const postExchangeTrump = async (roomCode: string, asHost: boolean) => {
  const hostQuery = asHost ? `?hostToken=${encodeURIComponent(HOST_TOKEN)}` : "";
  return handleRequest(
    new Request(`http://example/rooms/${roomCode}/exchange-trump${hostQuery}`, {
      method: "POST",
    }),
  );
};

const postDeclare66 = async (roomCode: string, asHost: boolean) => {
  const hostQuery = asHost ? `?hostToken=${encodeURIComponent(HOST_TOKEN)}` : "";
  return handleRequest(
    new Request(`http://example/rooms/${roomCode}/declare-66${hostQuery}`, {
      method: "POST",
    }),
  );
};

const postCloseDeck = async (roomCode: string, asHost: boolean) => {
  const hostQuery = asHost ? `?hostToken=${encodeURIComponent(HOST_TOKEN)}` : "";
  return handleRequest(
    new Request(`http://example/rooms/${roomCode}/close-deck${hostQuery}`, {
      method: "POST",
    }),
  );
};

const postReady = async (roomCode: string, asHost: boolean) => {
  const hostQuery = asHost ? `?hostToken=${encodeURIComponent(HOST_TOKEN)}` : "";
  return handleRequest(
    new Request(`http://example/rooms/${roomCode}/ready${hostQuery}`, {
      method: "POST",
    }),
  );
};

const postNextRound = async (roomCode: string, asHost: boolean) => {
  const hostQuery = asHost ? `?hostToken=${encodeURIComponent(HOST_TOKEN)}` : "";
  return handleRequest(
    new Request(`http://example/rooms/${roomCode}/next-round${hostQuery}`, {
      method: "POST",
    }),
  );
};

const getResults = async (roomCode: string) =>
  handleRequest(new Request(`http://example/rooms/${roomCode}/results`));
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

describe("exchange trump endpoint", () => {
  test("exchanges the trump 9 for the trump card when allowed", async () => {
    const trumpNine: Card = { suit: "hearts", rank: "9" };
    const trumpCard: Card = { suit: "hearts", rank: "A" };
    const game = buildGameState({
      playerHands: [[trumpNine], [{ suit: "spades", rank: "K" }]],
      leader: 0,
      stock: [
        { suit: "diamonds", rank: "J" },
        { suit: "clubs", rank: "Q" },
        { suit: "spades", rank: "10" },
      ],
      trumpCard,
      trumpSuit: "hearts",
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postExchangeTrump(room.code, true);
      expect(response.status).toBe(200);

      const nextGame = room.matchState.game;
      expect(nextGame.trumpCard).toEqual(trumpNine);
      expect(nextGame.playerHands[0]).toEqual([trumpCard]);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("rejects an exchange attempt from the non-leader", async () => {
    const trumpNine: Card = { suit: "hearts", rank: "9" };
    const game = buildGameState({
      playerHands: [[trumpNine], [{ suit: "spades", rank: "K" }]],
      leader: 0,
      stock: [
        { suit: "diamonds", rank: "J" },
        { suit: "clubs", rank: "Q" },
        { suit: "spades", rank: "10" },
      ],
      trumpCard: { suit: "hearts", rank: "A" },
      trumpSuit: "hearts",
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postExchangeTrump(room.code, false);
      expect(response.status).toBe(409);
      expect(room.matchState.game.trumpCard).toEqual({ suit: "hearts", rank: "A" });
      expect(room.matchState.game.playerHands[0]).toEqual([trumpNine]);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("rejects an exchange attempt when the leader lacks the trump 9", async () => {
    const game = buildGameState({
      playerHands: [[{ suit: "hearts", rank: "K" }], [{ suit: "spades", rank: "9" }]],
      leader: 0,
      stock: [
        { suit: "diamonds", rank: "J" },
        { suit: "clubs", rank: "Q" },
        { suit: "spades", rank: "10" },
      ],
      trumpCard: { suit: "hearts", rank: "A" },
      trumpSuit: "hearts",
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postExchangeTrump(room.code, true);
      expect(response.status).toBe(409);
      expect(room.matchState.game.trumpCard).toEqual({ suit: "hearts", rank: "A" });
      expect(room.matchState.game.playerHands[0]).toEqual([{ suit: "hearts", rank: "K" }]);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("rejects an exchange attempt when the stock is too small", async () => {
    const trumpNine: Card = { suit: "hearts", rank: "9" };
    const game = buildGameState({
      playerHands: [[trumpNine], [{ suit: "spades", rank: "9" }]],
      leader: 0,
      stock: [
        { suit: "diamonds", rank: "J" },
        { suit: "clubs", rank: "Q" },
      ],
      trumpCard: { suit: "hearts", rank: "A" },
      trumpSuit: "hearts",
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postExchangeTrump(room.code, true);
      expect(response.status).toBe(409);
      expect(room.matchState.game.trumpCard).toEqual({ suit: "hearts", rank: "A" });
      expect(room.matchState.game.playerHands[0]).toEqual([trumpNine]);
    } finally {
      deleteRoom(room.code);
    }
  });
});

describe("declare 66 endpoint", () => {
  test("declares 66 and updates match scores", async () => {
    const game = buildGameState({
      roundScores: [66, 0],
      canDeclareWindow: 0,
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postDeclare66(room.code, true);
      expect(response.status).toBe(200);

      const nextGame = room.matchState.game;
      expect(nextGame.roundResult?.reason).toBe("declared_66");
      expect(nextGame.roundResult?.winner).toBe(0);
      expect(room.matchState.matchScores).toEqual([3, 0]);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("rejects a declaration when the player cannot declare", async () => {
    const game = buildGameState({
      roundScores: [65, 0],
      canDeclareWindow: 0,
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postDeclare66(room.code, true);
      expect(response.status).toBe(409);
      expect(room.matchState.game.roundResult).toBeNull();
      expect(room.matchState.matchScores).toEqual([0, 0]);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("rejects a declaration when the round already ended", async () => {
    const game = buildGameState({
      roundScores: [66, 0],
      canDeclareWindow: 0,
      roundResult: { winner: 0, gamePoints: 3, reason: "declared_66" },
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postDeclare66(room.code, true);
      expect(response.status).toBe(409);
      expect(room.matchState.matchScores).toEqual([0, 0]);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("rejects a declaration when the match already ended", async () => {
    const game = buildGameState({
      roundScores: [66, 0],
      canDeclareWindow: 0,
    });
    const room = createTestRoom(game, 0);
    room.matchState.matchScores = [11, 0];

    try {
      const response = await postDeclare66(room.code, true);
      expect(response.status).toBe(409);
      expect(room.matchState.matchScores).toEqual([11, 0]);
      expect(room.matchState.game.roundResult).toBeNull();
    } finally {
      deleteRoom(room.code);
    }
  });
});

describe("close deck endpoint", () => {
  test("closes the deck when allowed", async () => {
    const game = buildGameState({
      playerHands: [[{ suit: "hearts", rank: "A" }], [{ suit: "spades", rank: "K" }]],
      leader: 0,
      stock: [
        { suit: "diamonds", rank: "J" },
        { suit: "clubs", rank: "Q" },
        { suit: "spades", rank: "10" },
      ],
      trumpCard: { suit: "hearts", rank: "9" },
      trumpSuit: "hearts",
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postCloseDeck(room.code, true);
      expect(response.status).toBe(200);
      expect(room.matchState.game.isClosed).toBe(true);
      expect(room.matchState.game.closedBy).toBe(0);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("rejects a close attempt from the non-leader", async () => {
    const game = buildGameState({
      playerHands: [[{ suit: "hearts", rank: "A" }], [{ suit: "spades", rank: "K" }]],
      leader: 0,
      stock: [
        { suit: "diamonds", rank: "J" },
        { suit: "clubs", rank: "Q" },
        { suit: "spades", rank: "10" },
      ],
      trumpCard: { suit: "hearts", rank: "9" },
      trumpSuit: "hearts",
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postCloseDeck(room.code, false);
      expect(response.status).toBe(409);
      expect(room.matchState.game.isClosed).toBe(false);
      expect(room.matchState.game.closedBy).toBeNull();
    } finally {
      deleteRoom(room.code);
    }
  });

  test("rejects a close attempt during an active trick", async () => {
    const leaderCard: Card = { suit: "hearts", rank: "A" };
    const game = buildGameState({
      playerHands: [[leaderCard], [{ suit: "spades", rank: "K" }]],
      leader: 0,
      stock: [
        { suit: "diamonds", rank: "J" },
        { suit: "clubs", rank: "Q" },
        { suit: "spades", rank: "10" },
      ],
      trumpCard: { suit: "hearts", rank: "9" },
      trumpSuit: "hearts",
      currentTrick: { leaderIndex: 0, leaderCard },
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postCloseDeck(room.code, true);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        ok: false,
        error: "Cannot close the deck during a trick.",
      });
      expect(room.matchState.game.isClosed).toBe(false);
      expect(room.matchState.game.closedBy).toBeNull();
    } finally {
      deleteRoom(room.code);
    }
  });

  test("rejects a close attempt when the stock is too small", async () => {
    const game = buildGameState({
      playerHands: [[{ suit: "hearts", rank: "A" }], [{ suit: "spades", rank: "K" }]],
      leader: 0,
      stock: [
        { suit: "diamonds", rank: "J" },
        { suit: "clubs", rank: "Q" },
      ],
      trumpCard: { suit: "hearts", rank: "9" },
      trumpSuit: "hearts",
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postCloseDeck(room.code, true);
      expect(response.status).toBe(409);
      expect(room.matchState.game.isClosed).toBe(false);
      expect(room.matchState.game.closedBy).toBeNull();
    } finally {
      deleteRoom(room.code);
    }
  });

  test("rejects a close attempt when the deck is already closed", async () => {
    const game = buildGameState({
      playerHands: [[{ suit: "hearts", rank: "A" }], [{ suit: "spades", rank: "K" }]],
      leader: 0,
      stock: [
        { suit: "diamonds", rank: "J" },
        { suit: "clubs", rank: "Q" },
        { suit: "spades", rank: "10" },
      ],
      trumpCard: { suit: "hearts", rank: "9" },
      trumpSuit: "hearts",
      isClosed: true,
      closedBy: 0,
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postCloseDeck(room.code, true);
      expect(response.status).toBe(409);
      expect(room.matchState.game.isClosed).toBe(true);
      expect(room.matchState.game.closedBy).toBe(0);
    } finally {
      deleteRoom(room.code);
    }
  });
});

describe("ready endpoint", () => {
  test("rejects readiness while round is still active", async () => {
    const game = buildGameState();
    const room = createTestRoom(game, 0);

    try {
      const response = await postReady(room.code, true);
      expect(response.status).toBe(409);
      expect(room.hostReady).toBe(false);
      expect(room.guestReady).toBe(false);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("marks the caller as ready when the round has ended", async () => {
    const game = buildGameState({
      roundResult: { winner: 0, gamePoints: 2, reason: "exhausted" },
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postReady(room.code, true);
      expect(response.status).toBe(200);
      expect(room.hostReady).toBe(true);
      expect(room.guestReady).toBe(false);
      expect(room.matchState.game.roundResult?.winner).toBe(0);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("starts a new round when both players are ready", async () => {
    const game = buildGameState({
      roundResult: { winner: 0, gamePoints: 2, reason: "exhausted" },
    });
    const room = createTestRoom(game, 0);
    room.matchState.matchScores = [2, 0];

    try {
      const hostResponse = await postReady(room.code, true);
      expect(hostResponse.status).toBe(200);

      const guestResponse = await postReady(room.code, false);
      expect(guestResponse.status).toBe(200);

      expect(room.hostReady).toBe(false);
      expect(room.guestReady).toBe(false);
      expect(room.matchState.matchScores).toEqual([2, 0]);
      expect(room.matchState.game.roundResult).toBeNull();
      expect(room.matchState.game.playerHands[0]).toHaveLength(6);
      expect(room.matchState.game.playerHands[1]).toHaveLength(6);
      expect(room.matchState.dealerIndex).toBe(1);
      expect(room.matchState.leaderIndex).toBe(0);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("rejects readiness when the match is already over", async () => {
    const game = buildGameState({
      roundResult: { winner: 0, gamePoints: 3, reason: "declared_66" },
    });
    const room = createTestRoom(game, 0);
    room.matchState.matchScores = [11, 5];

    try {
      const response = await postReady(room.code, true);
      expect(response.status).toBe(409);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("does not double count points when advancing after a play-ended round", async () => {
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
      const response = await postCloseDeck(room.code, true);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        ok: false,
        error: "Cannot close the deck during a trick.",
      });
      expect(room.matchState.game.isClosed).toBe(false);
      expect(room.matchState.game.closedBy).toBeNull();
      const playResponse = await postPlay(room.code, { card: followerCard }, false);
      expect(playResponse.status).toBe(200);
      expect(room.matchState.matchScores).toEqual([3, 0]);

      const hostResponse = await postReady(room.code, true);
      expect(hostResponse.status).toBe(200);

      const guestResponse = await postReady(room.code, false);
      expect(guestResponse.status).toBe(200);

      expect(room.matchState.matchScores).toEqual([3, 0]);
      expect(room.matchState.game.roundResult).toBeNull();
    } finally {
      deleteRoom(room.code);
    }
  });
});

describe("next round endpoint", () => {
  test("returns ok with no changes when the round has already started", async () => {
    const game = buildGameState();
    const room = createTestRoom(game, 0);
    room.hostReady = true;
    room.guestReady = true;

    try {
      const response = await postNextRound(room.code, false);
      expect(response.status).toBe(200);
      expect(room.hostReady).toBe(true);
      expect(room.guestReady).toBe(true);
      expect(room.matchState.game.roundResult).toBeNull();
    } finally {
      deleteRoom(room.code);
    }
  });

  test("starts a new round when the previous round ended", async () => {
    const game = buildGameState({
      roundResult: { winner: 1, gamePoints: 1, reason: "declared_66" },
    });
    const room = createTestRoom(game, 0);
    room.hostReady = true;
    room.guestReady = true;
    room.matchState.matchScores = [3, 5];

    try {
      const response = await postNextRound(room.code, true);
      expect(response.status).toBe(200);
      expect(room.hostReady).toBe(false);
      expect(room.guestReady).toBe(false);
      expect(room.matchState.matchScores).toEqual([3, 5]);
      expect(room.matchState.game.roundResult).toBeNull();
      expect(room.matchState.game.playerHands[0]).toHaveLength(6);
      expect(room.matchState.game.playerHands[1]).toHaveLength(6);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("rejects next-round when the match is over", async () => {
    const game = buildGameState({
      roundResult: { winner: 0, gamePoints: 3, reason: "declared_66" },
    });
    const room = createTestRoom(game, 0);
    room.matchState.matchScores = [11, 5];

    try {
      const response = await postNextRound(room.code, false);
      expect(response.status).toBe(409);
    } finally {
      deleteRoom(room.code);
    }
  });
});

describe("results endpoint", () => {
  test("renders the results page when the match is over", async () => {
    const game = buildGameState({
      roundResult: { winner: 0, gamePoints: 2, reason: "exhausted" },
    });
    const room = createTestRoom(game, 0);
    room.matchState.matchScores = [11, 5];

    try {
      const response = await getResults(room.code);
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("Match Results");
      expect(body).toContain("Return to Lobby");
    } finally {
      deleteRoom(room.code);
    }
  });

  test("redirects to the game when the match is not over", async () => {
    const game = buildGameState({
      roundResult: { winner: 0, gamePoints: 2, reason: "exhausted" },
    });
    const room = createTestRoom(game, 0);
    room.matchState.matchScores = [5, 5];

    try {
      const response = await getResults(room.code);
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        `/rooms/${encodeURIComponent(room.code)}/game`,
      );
    } finally {
      deleteRoom(room.code);
    }
  });

  test("shows the join page for expired rooms", async () => {
    const game = buildGameState({
      roundResult: { winner: 0, gamePoints: 2, reason: "exhausted" },
    });
    const room = createTestRoom(game, 0);
    deleteRoom(room.code, "expired");

    const response = await getResults(room.code);
    expect(response.status).toBe(410);
    const body = await response.text();
    expect(body).toContain("Room expired. Start a new room.");
  });

  test("shows the join page for missing rooms", async () => {
    const response = await getResults("NOPE");
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toContain("Room not found. Double-check the code.");
  });
});
