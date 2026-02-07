import { describe, expect, test } from "bun:test";
import { handleRequest, resolvePort } from "./index";
import { createRoom, deleteRoom } from "./rooms";
import {
  calculateGamePoints,
  type Card,
  type GameState,
} from "./game";

const HOST_TOKEN = "host-token";
const decoder = new TextDecoder();

type SseEvent = {
  event: string;
  data: string;
};

function parseSseEvents(buffer: string): { events: SseEvent[]; remainder: string } {
  const blocks = buffer.split("\n\n");
  const remainder = blocks.pop() ?? "";
  const events: SseEvent[] = [];

  for (const block of blocks) {
    if (!block || block.startsWith(":")) {
      continue;
    }
    let eventName = "";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) {
        eventName = line.slice("event: ".length);
      } else if (line.startsWith("data: ")) {
        dataLines.push(line.slice("data: ".length));
      }
    }
    if (eventName) {
      events.push({ event: eventName, data: dataLines.join("\n") });
    }
  }

  return { events, remainder };
}

async function readSseEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  count: number,
  timeoutMs = 1000,
): Promise<SseEvent[]> {
  const deadline = Date.now() + timeoutMs;
  const events: SseEvent[] = [];
  let buffer = "";

  while (events.length < count) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${count} SSE events`);
    }

    const { value, done } = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Timed out reading SSE data")), timeoutMs);
      }),
    ]);

    if (done || !value) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseEvents(buffer);
    buffer = parsed.remainder;
    events.push(...parsed.events);
  }

  return events.slice(0, count);
}

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

const postNewMatch = async (
  roomCode: string,
  hostToken: string | undefined = HOST_TOKEN,
) => {
  return handleRequest(
    new Request(`http://example/rooms/${roomCode}/new-match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(hostToken ? { hostToken } : {}),
    }),
  );
};

const getResults = async (roomCode: string) =>
  handleRequest(new Request(`http://example/rooms/${roomCode}/results`));
const getGame = async (roomCode: string) =>
  handleRequest(new Request(`http://example/rooms/${roomCode}/game`));
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

describe("viewer identity (resolveViewerIndex)", () => {
  test("resolves as host when hostToken query param matches", async () => {
    const game = buildGameState();
    const room = createTestRoom(game, 0);
    try {
      const response = await handleRequest(
        new Request(`http://example/rooms/${room.code}/game?hostToken=${encodeURIComponent(HOST_TOKEN)}`),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      // Host viewerIndex=0 (hostPlayerIndex=0), so JS variable should be 0
      expect(html).toContain("const viewerIndex = 0;");
      expect(html).toContain("const opponentIndex = 1;");
    } finally {
      deleteRoom(room.code);
    }
  });

  test("resolves as guest when no hostToken query param", async () => {
    const game = buildGameState();
    const room = createTestRoom(game, 0);
    try {
      const response = await handleRequest(
        new Request(`http://example/rooms/${room.code}/game`),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      // Guest viewerIndex=1 (hostPlayerIndex=0, so guest=1)
      expect(html).toContain("const viewerIndex = 1;");
      expect(html).toContain("const opponentIndex = 0;");
    } finally {
      deleteRoom(room.code);
    }
  });

  test("resolves as guest when hostToken query param is wrong", async () => {
    const game = buildGameState();
    const room = createTestRoom(game, 0);
    try {
      const response = await handleRequest(
        new Request(`http://example/rooms/${room.code}/game?hostToken=wrong-token`),
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      // Wrong token → guest
      expect(html).toContain("const viewerIndex = 1;");
      expect(html).toContain("const opponentIndex = 0;");
    } finally {
      deleteRoom(room.code);
    }
  });

  test("resolves correctly when hostPlayerIndex is 1", async () => {
    const game = buildGameState();
    const room = createTestRoom(game, 1);
    try {
      // Host with token → viewerIndex=1 (hostPlayerIndex)
      const hostResponse = await handleRequest(
        new Request(`http://example/rooms/${room.code}/game?hostToken=${encodeURIComponent(HOST_TOKEN)}`),
      );
      expect(hostResponse.status).toBe(200);
      const hostHtml = await hostResponse.text();
      expect(hostHtml).toContain("const viewerIndex = 1;");
      expect(hostHtml).toContain("const opponentIndex = 0;");

      // Guest without token → viewerIndex=0 (opposite of hostPlayerIndex)
      const guestResponse = await handleRequest(
        new Request(`http://example/rooms/${room.code}/game`),
      );
      expect(guestResponse.status).toBe(200);
      const guestHtml = await guestResponse.text();
      expect(guestHtml).toContain("const viewerIndex = 0;");
      expect(guestHtml).toContain("const opponentIndex = 1;");
    } finally {
      deleteRoom(room.code);
    }
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

  test("plays to exhaustion and applies the last-trick bonus to round and game scoring", async () => {
    const firstLead: Card = { suit: "hearts", rank: "A" };
    const firstFollow: Card = { suit: "hearts", rank: "9" };
    const secondLead: Card = { suit: "clubs", rank: "A" };
    const secondFollow: Card = { suit: "clubs", rank: "9" };
    const game = buildGameState({
      playerHands: [
        [firstLead, secondLead],
        [firstFollow, secondFollow],
      ],
      leader: 0,
      stock: [],
      trumpCard: null,
      trumpSuit: "spades",
      roundScores: [34, 32],
    });
    const room = createTestRoom(game, 0);

    try {
      const firstLeadResponse = await postPlay(room.code, { card: firstLead }, true);
      expect(firstLeadResponse.status).toBe(200);

      const firstFollowResponse = await postPlay(room.code, { card: firstFollow }, false);
      expect(firstFollowResponse.status).toBe(200);

      const secondLeadResponse = await postPlay(room.code, { card: secondLead }, true);
      expect(secondLeadResponse.status).toBe(200);

      const secondFollowResponse = await postPlay(room.code, { card: secondFollow }, false);
      expect(secondFollowResponse.status).toBe(200);

      const nextGame = room.matchState.game;
      expect(nextGame.roundResult?.reason).toBe("exhausted");
      expect(nextGame.roundResult?.winner).toBe(0);
      expect(nextGame.roundScores).toEqual([66, 32]);
      expect(nextGame.roundResult?.gamePoints).toBe(calculateGamePoints(nextGame.roundScores[1]));
      expect(room.matchState.matchScores).toEqual([2, 0]);
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
      roundScores: [66, 32],
      canDeclareWindow: 0,
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postDeclare66(room.code, true);
      expect(response.status).toBe(200);

      const nextGame = room.matchState.game;
      expect(nextGame.roundResult?.reason).toBe("declared_66");
      expect(nextGame.roundResult?.winner).toBe(0);
      expect(nextGame.roundScores).toEqual([66, 32]);
      expect(room.matchState.matchScores).toEqual([2, 0]);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("applies false-declaration penalty when score is below 66", async () => {
    const game = buildGameState({
      roundScores: [65, 0],
      canDeclareWindow: 0,
    });
    const room = createTestRoom(game, 0);

    try {
      const response = await postDeclare66(room.code, true);
      expect(response.status).toBe(200);
      expect(room.matchState.game.roundResult).toEqual({
        winner: 1,
        gamePoints: 2,
        reason: "false_declaration",
      });
      expect(room.matchState.matchScores).toEqual([0, 2]);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("rejects a declaration when the player cannot declare", async () => {
    const game = buildGameState({
      roundScores: [65, 0],
      canDeclareWindow: null,
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

describe("SSE payloads", () => {
  test("sends game-state with opponent hand and stock as count objects", async () => {
    const game = buildGameState({
      playerHands: [
        [
          { suit: "hearts", rank: "A" },
          { suit: "clubs", rank: "K" },
        ],
        [
          { suit: "spades", rank: "9" },
          { suit: "diamonds", rank: "10" },
          { suit: "hearts", rank: "Q" },
        ],
      ],
      stock: [
        { suit: "clubs", rank: "A" },
        { suit: "spades", rank: "J" },
      ],
      leader: 0,
    });
    const room = createTestRoom(game, 0);

    const hostAbort = new AbortController();
    const guestAbort = new AbortController();

    try {
      const hostResponse = await handleRequest(
        new Request(`http://example/sse/${room.code}?hostToken=${encodeURIComponent(HOST_TOKEN)}`, {
          signal: hostAbort.signal,
        }),
      );
      expect(hostResponse.status).toBe(200);
      const hostReader = hostResponse.body?.getReader();
      if (!hostReader) {
        throw new Error("Expected host SSE stream reader");
      }
      await readSseEvents(hostReader, 1);

      const guestResponse = await handleRequest(
        new Request(`http://example/sse/${room.code}`, { signal: guestAbort.signal }),
      );
      expect(guestResponse.status).toBe(200);

      const hostEvents = await readSseEvents(hostReader, 4);
      const gameStateEvent = hostEvents.find((event) => event.event === "game-state");
      expect(gameStateEvent).toBeDefined();
      const payload = JSON.parse(gameStateEvent?.data ?? "{}");

      expect(payload.game.playerHands[0]).toEqual(game.playerHands[0]);
      expect(payload.game.playerHands[1]).toEqual({ count: game.playerHands[1].length });
      expect(payload.game.stock).toEqual({ count: game.stock.length });
      expect(payload.game.roundScores[0]).toBe(game.roundScores[0]);
      expect(payload.game.roundScores[1]).toBeNull();
      expect(Array.isArray(payload.game.playerHands[1])).toBe(false);
      expect(Array.isArray(payload.game.stock)).toBe(false);
    } finally {
      hostAbort.abort();
      guestAbort.abort();
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

describe("new match endpoint", () => {
  test("resets room and broadcasts a fresh game state after match over", async () => {
    const game = buildGameState({
      roundResult: { winner: 0, gamePoints: 3, reason: "declared_66" },
    });
    const room = createTestRoom(game, 0);
    room.matchState.matchScores = [11, 4];
    room.forfeit = true;
    room.draw = false;
    room.hostReady = true;
    room.guestReady = true;
    room.disconnectTimeouts.host = setTimeout(() => {}, 60_000);
    room.disconnectTimeouts.guest = setTimeout(() => {}, 60_000);

    const hostAbort = new AbortController();

    try {
      const hostSseResponse = await handleRequest(
        new Request(`http://example/sse/${room.code}?hostToken=${encodeURIComponent(HOST_TOKEN)}`, {
          signal: hostAbort.signal,
        }),
      );
      expect(hostSseResponse.status).toBe(200);
      const hostReader = hostSseResponse.body?.getReader();
      if (!hostReader) {
        throw new Error("Expected host SSE stream reader");
      }
      await readSseEvents(hostReader, 1);

      const response = await postNewMatch(room.code, HOST_TOKEN);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });

      expect(room.matchState.matchScores).toEqual([0, 0]);
      expect(room.matchState.game.roundResult).toBeNull();
      expect(room.forfeit).toBe(false);
      expect(room.draw).toBe(false);
      expect(room.hostReady).toBe(false);
      expect(room.guestReady).toBe(false);
      expect(room.disconnectTimeouts.host).toBeUndefined();
      expect(room.disconnectTimeouts.guest).toBeUndefined();
      expect(room.disconnectTimeouts).toEqual({});
      expect(room.matchState.game.playerHands[0]).toHaveLength(6);
      expect(room.matchState.game.playerHands[1]).toHaveLength(6);

      const events = await readSseEvents(hostReader, 1);
      const gameStateEvent = events.find((event) => event.event === "game-state");
      expect(gameStateEvent).toBeDefined();
      const payload = JSON.parse(gameStateEvent?.data ?? "{}") as {
        draw?: boolean;
        matchScores?: [number, number];
      };
      expect(payload.draw).toBe(false);
      expect(payload.matchScores).toEqual([0, 0]);
    } finally {
      hostAbort.abort();
      deleteRoom(room.code);
    }
  });

  test("rejects reset when match is not over", async () => {
    const room = createTestRoom(buildGameState(), 0);
    room.matchState.matchScores = [10, 5];

    try {
      const response = await postNewMatch(room.code, HOST_TOKEN);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        ok: false,
        error: "Match is not over.",
      });
      expect(room.matchState.matchScores).toEqual([10, 5]);
    } finally {
      deleteRoom(room.code);
    }
  });

  test("rejects reset when the caller is not the host", async () => {
    const game = buildGameState({
      roundResult: { winner: 0, gamePoints: 3, reason: "declared_66" },
    });
    const room = createTestRoom(game, 0);
    room.matchState.matchScores = [11, 2];

    try {
      const response = await postNewMatch(room.code, "invalid-host-token");
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        ok: false,
        error: "Only the host can start a new match.",
      });
      expect(room.matchState.matchScores).toEqual([11, 2]);
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

  test("renders the results page when the match ends in a draw", async () => {
    const game = buildGameState();
    const room = createTestRoom(game, 0);
    room.matchState.matchScores = [5, 5];
    room.draw = true;

    try {
      const response = await getResults(room.code);
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("Match drawn");
      expect(body).toContain("Both players disconnected");
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

describe("game endpoint", () => {
  test("redirects to results when the room is a draw", async () => {
    const room = createTestRoom(buildGameState(), 0);
    room.draw = true;

    try {
      const response = await getGame(room.code);
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        `/rooms/${encodeURIComponent(room.code)}/results`,
      );
    } finally {
      deleteRoom(room.code);
    }
  });

  test("renders game page with initial match-over flag when match is complete", async () => {
    const room = createTestRoom(
      buildGameState({
        roundResult: { winner: 0, gamePoints: 3, reason: "declared_66" },
      }),
      0,
    );
    room.matchState.matchScores = [11, 4];

    try {
      const response = await getGame(room.code);
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("const initialMatchOver = true;");
    } finally {
      deleteRoom(room.code);
    }
  });
});
