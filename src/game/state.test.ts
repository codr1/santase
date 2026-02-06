import { describe, expect, test } from "bun:test";
import {
  DECLARE_THRESHOLD,
  MARRIAGE_POINTS,
  TRUMP_MARRIAGE_POINTS,
  createDeck,
} from "./cards";
import {
  canDeclareMarriage,
  canDeclare66,
  calculateGamePoints,
  calculateWinPoints,
  declare66,
  canExchangeTrump9,
  declareMarriage,
  dealInitialHands,
  drawFromStock,
  exchangeTrump9,
  findDeclareableMarriages,
  getViewerMatchState,
  applyRoundResult,
  getMatchWinner,
  isMatchOver,
  getValidFollowerCards,
  getStockCount,
  canCloseDeck,
  closeDeck,
  hasPotentialMarriage,
  initializeMatch,
  isDeckClosedOrExhausted,
  playTrick,
  startMatch,
  startNewRound,
  type GameState,
  type MatchState,
} from "./state";

describe("dealInitialHands", () => {
  test("deals 6 cards per player", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck, 1);

    expect(state.playerHands[0]).toHaveLength(6);
    expect(state.playerHands[1]).toHaveLength(6);
  });

  test("leaves 11 cards in stock", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck, 1);

    expect(state.stock).toHaveLength(11);
  });

  test("uses a trump card from the original deck", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck, 1);

    expect(state.trumpCard).not.toBeNull();
    expect(deck).toContainEqual(state.trumpCard);
  });

  test("sets the trump suit from the trump card", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck, 1);

    expect(state.trumpCard).not.toBeNull();
    expect(state.trumpSuit).toBe(state.trumpCard.suit);
  });

  test("defaults isClosed to false", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck, 1);

    expect(state.isClosed).toBe(false);
  });

  test("defaults closedBy to null", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck);

    expect(state.closedBy).toBeNull();
  });

  test("initializes declared marriages as empty", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck, 1);

    expect(state.declaredMarriages).toEqual([]);
  });

  test("sets the leader as the dealer's opponent", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck, 0);

    expect(state.leader).toBe(1);
  });

  test("sets the leader as the dealer's opponent when dealer is player 1", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck, 1);

    expect(state.leader).toBe(0);
  });
});

describe("getViewerMatchState", () => {
  const buildMatchState = (): MatchState => ({
    game: {
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
      trumpCard: { suit: "hearts", rank: "9" },
      trumpSuit: "hearts",
      isClosed: false,
      leader: 0,
      currentTrick: null,
      lastCompletedTrick: null,
      closedBy: null,
      wonTricks: [[], []],
      roundScores: [12, 8],
      declaredMarriages: [],
      canDeclareWindow: null,
      roundResult: null,
    },
    matchScores: [2, 3],
    dealerIndex: 0,
    leaderIndex: 1,
  });

  test("hides opponent hand cards and stock cards behind counts", () => {
    const matchState = buildMatchState();

    const viewerState = getViewerMatchState(matchState, 0);

    expect(viewerState.game.playerHands[0]).toEqual(matchState.game.playerHands[0]);
    expect(viewerState.game.playerHands[1]).toEqual({
      count: matchState.game.playerHands[1].length,
    });
    expect(viewerState.game.stock).toEqual({ count: matchState.game.stock.length });
    expect(Array.isArray(viewerState.game.playerHands[1])).toBe(false);
    expect(Array.isArray(viewerState.game.stock)).toBe(false);
    expect(Number.isNaN(viewerState.game.roundScores[1])).toBe(true);
  });

  test("keeps player 1 hand visible and hides player 0 hand for viewer 1", () => {
    const matchState = buildMatchState();

    const viewerState = getViewerMatchState(matchState, 1);

    expect(viewerState.game.playerHands[1]).toEqual(matchState.game.playerHands[1]);
    expect(viewerState.game.playerHands[0]).toEqual({
      count: matchState.game.playerHands[0].length,
    });
    expect(viewerState.game.stock).toEqual({ count: matchState.game.stock.length });
    expect(Array.isArray(viewerState.game.playerHands[0])).toBe(false);
    expect(Array.isArray(viewerState.game.stock)).toBe(false);
    expect(Number.isNaN(viewerState.game.roundScores[0])).toBe(true);
  });
});

describe("getStockCount", () => {
  test("returns the stock size", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck, 1);

    expect(getStockCount(state)).toBe(11);
  });
});

describe("isDeckClosedOrExhausted", () => {
  test.each([
    {
      label: "returns true when the deck is closed",
      state: { isClosed: true, stock: [createDeck()[0]] },
      expected: true,
    },
    {
      label: "returns true when the stock is empty",
      state: { isClosed: false, stock: [] },
      expected: true,
    },
    {
      label: "returns false when the deck is open and stock has cards",
      state: { isClosed: false, stock: [createDeck()[0]] },
      expected: false,
    },
  ])("$label", ({ state, expected }) => {
    const baseState = dealInitialHands(createDeck(), 1);
    const testState: GameState = { ...baseState, ...state };

    expect(isDeckClosedOrExhausted(testState)).toBe(expected);
  });
});

describe("canCloseDeck", () => {
  test("returns true when stock has at least 3 cards, deck is open, and trump card exists", () => {
    const baseState = makeState([[], []]);
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 3),
      isClosed: false,
      trumpCard: { suit: "hearts", rank: "9" },
    };

    expect(canCloseDeck(testState, 0)).toBe(true);
  });

  test("returns false when stock has fewer than 3 cards", () => {
    const baseState = makeState([[], []]);
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 2),
      isClosed: false,
    };

    expect(canCloseDeck(testState, 0)).toBe(false);
  });

  test("returns false when the deck is already closed", () => {
    const baseState = makeState([[], []]);
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 3),
      isClosed: true,
    };

    expect(canCloseDeck(testState, 0)).toBe(false);
  });

  test("returns false when the trump card is null", () => {
    const baseState = makeState([[], []]);
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 3),
      trumpCard: null,
    };

    expect(canCloseDeck(testState, 0)).toBe(false);
  });

  test("returns false when the round already ended", () => {
    const baseState = makeState([[], []]);
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 3),
      isClosed: false,
      trumpCard: { suit: "hearts", rank: "9" },
      roundResult: {
        winner: 0,
        gamePoints: 3,
        reason: "declared_66",
      },
    };

    expect(canCloseDeck(testState, 0)).toBe(false);
  });

  test("returns false when a trick is in progress", () => {
    const baseState = makeState([[], []]);
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 3),
      isClosed: false,
      trumpCard: { suit: "hearts", rank: "9" },
      currentTrick: {
        leaderIndex: 0,
        leaderCard: { suit: "clubs", rank: "A" },
      },
    };

    expect(canCloseDeck(testState, 0)).toBe(false);
  });

  test("returns false when the player is not the leader", () => {
    const baseState = makeState([[], []], [], { leader: 1 });
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 3),
      isClosed: false,
      trumpCard: { suit: "hearts", rank: "9" },
    };

    expect(canCloseDeck(testState, 0)).toBe(false);
  });
});

describe("closeDeck", () => {
  test("successfully closes the deck", () => {
    const baseState = makeState([[], []]);
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 3),
      isClosed: false,
      closedBy: null,
      trumpCard: { suit: "hearts", rank: "9" },
    };

    const nextState = closeDeck(testState, 0);

    expect(nextState.isClosed).toBe(true);
    expect(nextState).not.toBe(testState);
  });

  test("sets closedBy to the closing player", () => {
    const baseState = makeState([[], []], [], { leader: 1 });
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 3),
      isClosed: false,
      closedBy: null,
      trumpCard: { suit: "diamonds", rank: "J" },
    };

    const nextState = closeDeck(testState, 1);

    expect(nextState.closedBy).toBe(1);
  });

  test("throws when stock has fewer than 3 cards", () => {
    const baseState = makeState([[], []]);
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 2),
      isClosed: false,
      trumpCard: { suit: "hearts", rank: "9" },
    };

    expect(() => closeDeck(testState, 0)).toThrow(
      "Stock must have at least 3 cards to close the deck.",
    );
  });

  test("throws when the deck is already closed", () => {
    const baseState = makeState([[], []]);
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 3),
      isClosed: true,
      trumpCard: { suit: "hearts", rank: "9" },
    };

    expect(() => closeDeck(testState, 0)).toThrow("Deck is already closed.");
  });

  test("throws when the trump card is null", () => {
    const baseState = makeState([[], []]);
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 3),
      isClosed: false,
      trumpCard: null,
    };

    expect(() => closeDeck(testState, 0)).toThrow(
      "Trump card is not available to close the deck.",
    );
  });

  test("throws when the round already ended", () => {
    const baseState = makeState([[], []]);
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 3),
      isClosed: false,
      trumpCard: { suit: "hearts", rank: "9" },
      roundResult: {
        winner: 0,
        gamePoints: 3,
        reason: "declared_66",
      },
    };

    expect(() => closeDeck(testState, 0)).toThrow("Round already ended.");
  });

  test("throws when the current trick is in progress", () => {
    const baseState = makeState([[], []]);
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 3),
      isClosed: false,
      trumpCard: { suit: "hearts", rank: "9" },
      currentTrick: {
        leaderIndex: 0,
        leaderCard: { suit: "clubs", rank: "A" },
      },
    };

    expect(() => closeDeck(testState, 0)).toThrow(
      "Cannot close the deck during a trick.",
    );
  });

  test("throws when the player is not the trick leader", () => {
    const baseState = makeState([[], []], [], { leader: 1 });
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 3),
      isClosed: false,
      trumpCard: { suit: "hearts", rank: "9" },
    };

    expect(() => closeDeck(testState, 0)).toThrow(
      "Only the trick leader can close the deck.",
    );
  });

  test("marks deck as closed for isDeckClosedOrExhausted", () => {
    const baseState = makeState([[], []]);
    const testState: GameState = {
      ...baseState,
      stock: createDeck().slice(0, 3),
      isClosed: false,
      trumpCard: { suit: "hearts", rank: "9" },
    };

    const nextState = closeDeck(testState, 0);

    expect(isDeckClosedOrExhausted(nextState)).toBe(true);
  });
});

describe("initializeMatch", () => {
  test("returns a match state with zeroed scores", () => {
    const match = initializeMatch();

    expect(match.matchScores).toEqual([0, 0]);
  });

  test("returns fresh score arrays per call", () => {
    const firstMatch = initializeMatch();
    const secondMatch = initializeMatch();

    expect(firstMatch).not.toBe(secondMatch);
    expect(firstMatch.matchScores).not.toBe(secondMatch.matchScores);
    expect(firstMatch.matchScores).toEqual([0, 0]);
    expect(secondMatch.matchScores).toEqual([0, 0]);
  });
});

describe("applyRoundResult", () => {
  test("increments the winner's match score", () => {
    const matchState = initializeMatch();

    const nextState = applyRoundResult(matchState, 1, 2);

    expect(nextState.matchScores).toEqual([0, 2]);
    expect(matchState.matchScores).toEqual([0, 0]);
  });
});

describe("isMatchOver", () => {
  test("returns true when a player reaches 11 points", () => {
    const match = initializeMatch();

    expect(isMatchOver({ ...match, matchScores: [11, 7] })).toBe(true);
  });

  test("returns true when a player exceeds 11 points", () => {
    const match = initializeMatch();

    expect(isMatchOver({ ...match, matchScores: [6, 12] })).toBe(true);
  });

  test("returns false when no player has reached 11 points", () => {
    const match = initializeMatch();

    expect(isMatchOver({ ...match, matchScores: [10, 9] })).toBe(false);
  });
});

describe("getMatchWinner", () => {
  test("returns null when no one has reached 11 points", () => {
    const match = initializeMatch();

    expect(getMatchWinner({ ...match, matchScores: [10, 9] })).toBeNull();
  });

  test("returns the player who reaches 11 points", () => {
    const match = initializeMatch();

    expect(getMatchWinner({ ...match, matchScores: [11, 6] })).toBe(0);
  });

  test("returns the player who exceeds 11 points", () => {
    const match = initializeMatch();

    expect(getMatchWinner({ ...match, matchScores: [4, 14] })).toBe(1);
  });

  test("throws when the match is tied at or above 11 points", () => {
    const match = initializeMatch();

    expect(() => getMatchWinner({ ...match, matchScores: [11, 11] })).toThrow(
      "Match state is invalid: tied score at or above 11.",
    );
  });
});

describe("startMatch", () => {
  const DEALER_SAMPLE_SIZE = 100;
  const DEALER_MIN_SHARE = 0.3;

  test("returns a match state with an initialized game", () => {
    const match = startMatch();

    expect(match.game.playerHands[0]).toHaveLength(6);
    expect(match.game.playerHands[1]).toHaveLength(6);
    expect(match.game.stock.length).toBeGreaterThan(0);
    expect(match.game.trumpCard).not.toBeNull();
  });

  test("selects a dealer index of 0 or 1", () => {
    const match = startMatch();

    expect([0, 1]).toContain(match.dealerIndex);
  });

  test("randomizes dealer index distribution across matches", () => {
    const dealerCounts = { 0: 0, 1: 0 };

    for (let i = 0; i < DEALER_SAMPLE_SIZE; i += 1) {
      const match = startMatch();
      dealerCounts[match.dealerIndex] += 1;
    }

    const minimumCount = Math.floor(DEALER_SAMPLE_SIZE * DEALER_MIN_SHARE);

    expect(dealerCounts[0]).toBeGreaterThanOrEqual(minimumCount);
    expect(dealerCounts[1]).toBeGreaterThanOrEqual(minimumCount);
  });

  test("sets leader index opposite the dealer index", () => {
    const match = startMatch();

    expect(match.leaderIndex).toBe(match.dealerIndex === 0 ? 1 : 0);
  });

  test("starts match scores at 0-0", () => {
    const match = startMatch();

    expect(match.matchScores).toEqual([0, 0]);
  });
});

describe("startNewRound", () => {
  const makeFinishedMatchState = (winner: 0 | 1, gamePoints: 1 | 2 | 3) =>
    ({
      game: {
        ...makeState([[], []], ["hearts"]),
        playerHands: [
          [{ suit: "hearts", rank: "A" }],
          [{ suit: "clubs", rank: "K" }],
        ],
        stock: [{ suit: "spades", rank: "9" }],
        trumpCard: { suit: "diamonds", rank: "Q" },
        trumpSuit: "diamonds",
        isClosed: true,
        wonTricks: [
          [{ suit: "hearts", rank: "9" }],
          [{ suit: "clubs", rank: "9" }],
        ],
        roundScores: [66, 20],
        declaredMarriages: ["hearts"],
        roundResult: {
          winner,
          gamePoints,
          reason: "declared_66",
        },
      },
      matchScores: [4, 7],
      dealerIndex: 1,
      leaderIndex: 0,
    }) as const;

  const expectFreshRoundState = (nextState: ReturnType<typeof startNewRound>) => {
    expect(nextState.game.playerHands[0]).toHaveLength(6);
    expect(nextState.game.playerHands[1]).toHaveLength(6);
    expect(nextState.game.stock).toHaveLength(11);
    expect(nextState.game.trumpCard).not.toBeNull();
    expect(nextState.game.declaredMarriages).toEqual([]);
    expect(nextState.game.wonTricks).toEqual([[], []]);
    expect(nextState.game.roundScores).toEqual([0, 0]);
    expect(nextState.game.isClosed).toBe(false);
    expect(nextState.game.canDeclareWindow).toBeNull();
    expect(nextState.game.roundResult).toBeNull();
  };

  test("updates match state when player 1 wins", () => {
    const matchState = makeFinishedMatchState(1, 2);

    const nextState = startNewRound(matchState, 1);

    expect(nextState.dealerIndex).toBe(0);
    expect(nextState.leaderIndex).toBe(1);
    expect(nextState.matchScores).toEqual([4, 7]);
    expectFreshRoundState(nextState);
  });

  test("updates match state when player 0 wins", () => {
    const matchState = makeFinishedMatchState(0, 3);

    const nextState = startNewRound(matchState, 0);

    expect(nextState.dealerIndex).toBe(1);
    expect(nextState.leaderIndex).toBe(0);
    expect(nextState.matchScores).toEqual([4, 7]);
    expectFreshRoundState(nextState);
  });

  test("throws when round result is missing", () => {
    const matchState = {
      game: {
        ...makeState([[], []]),
      },
      matchScores: [0, 0],
      dealerIndex: 0,
      leaderIndex: 1,
    } as const;

    expect(() => startNewRound(matchState, 0)).toThrow("Round has not ended.");
  });

  test("throws when round winner does not match round result", () => {
    const matchState = makeFinishedMatchState(1, 1);

    expect(() => startNewRound(matchState, 0)).toThrow(
      "Round winner does not match the round result.",
    );
  });

  test("handles consecutive round resets with alternating winners", () => {
    const firstFinishedState = makeFinishedMatchState(0, 2);
    const afterFirstReset = startNewRound(firstFinishedState, 0);

    const secondFinishedState = {
      ...afterFirstReset,
      matchScores: [6, 8],
      game: {
        ...afterFirstReset.game,
        roundResult: {
          winner: 1,
          gamePoints: 1,
          reason: "exhausted",
        },
      },
    } as const;

    const afterSecondReset = startNewRound(secondFinishedState, 1);

    expect(afterSecondReset.matchScores).toEqual([6, 8]);
    expect(afterSecondReset.dealerIndex).toBe(0);
    expect(afterSecondReset.leaderIndex).toBe(1);
    expectFreshRoundState(afterSecondReset);
  });
});

describe("canDeclare66", () => {
  test("returns true when player has exactly 66 points", () => {
    const state = makeState([[], []]);
    state.roundScores = [DECLARE_THRESHOLD, 10];
    state.canDeclareWindow = 0;

    expect(canDeclare66(state, 0)).toBe(true);
  });

  test("returns true when player is above 66 points", () => {
    const state = makeState([[], []]);
    state.roundScores = [DECLARE_THRESHOLD + 6, 0];
    state.canDeclareWindow = 0;

    expect(canDeclare66(state, 0)).toBe(true);
  });

  test("returns true when player is below 66 points", () => {
    const state = makeState([[], []]);
    state.roundScores = [DECLARE_THRESHOLD - 1, DECLARE_THRESHOLD + 14];
    state.canDeclareWindow = 0;

    expect(canDeclare66(state, 0)).toBe(true);
  });

  test("returns true when player two can declare below the threshold", () => {
    const state = makeState([[], []]);
    state.roundScores = [10, DECLARE_THRESHOLD - 1];
    state.canDeclareWindow = 1;

    expect(canDeclare66(state, 1)).toBe(true);
  });

  test("returns false when the declaration window is for the other player", () => {
    const state = makeState([[], []]);
    state.roundScores = [DECLARE_THRESHOLD + 4, 10];
    state.canDeclareWindow = 1;

    expect(canDeclare66(state, 0)).toBe(false);
  });

  test("returns false when the declaration window is closed", () => {
    const state = makeState([[], []]);
    state.roundScores = [DECLARE_THRESHOLD + 4, 10];
    state.canDeclareWindow = null;

    expect(canDeclare66(state, 0)).toBe(false);
  });

  test("returns false when the round already ended", () => {
    const state = makeState([[], []]);
    state.roundScores = [DECLARE_THRESHOLD, 0];
    state.canDeclareWindow = 0;
    state.roundResult = {
      winner: 0,
      gamePoints: 3,
      reason: "declared_66",
    };

    expect(canDeclare66(state, 0)).toBe(false);
  });
});

describe("calculateGamePoints", () => {
  test("returns 3 when opponent has 0 points", () => {
    expect(calculateGamePoints(0)).toBe(3);
  });

  test("returns 2 when opponent has 1-32 points", () => {
    expect(calculateGamePoints(1)).toBe(2);
    expect(calculateGamePoints(32)).toBe(2);
  });

  test("returns 1 when opponent has 33 or more points", () => {
    expect(calculateGamePoints(33)).toBe(1);
    expect(calculateGamePoints(66)).toBe(1);
  });
});

describe("calculateWinPoints", () => {
  test("throws when round result is missing", () => {
    const state = makeState([[], []]);
    state.roundScores = [66, 0];

    expect(() => calculateWinPoints(state)).toThrow(
      "Round result is not available.",
    );
  });

  test.each([
    {
      label: "returns 3 when loser has 0 points",
      roundScores: [66, 0] as const,
      winner: 0 as const,
      expected: 3,
    },
    {
      label: "returns 2 when loser has 1-32 points",
      roundScores: [66, 32] as const,
      winner: 0 as const,
      expected: 2,
    },
    {
      label: "returns 1 when loser has 33 or more points",
      roundScores: [33, 66] as const,
      winner: 1 as const,
      expected: 1,
    },
  ])("$label", ({ roundScores, winner, expected }) => {
    const state = makeState([[], []]);
    state.roundScores = [...roundScores];
    state.roundResult = {
      winner,
      gamePoints: 1,
      reason: "exhausted",
    };

    expect(calculateWinPoints(state)).toBe(expected);
  });

  test("returns 3 when the closer loses regardless of score", () => {
    const state = makeState([[], []]);
    state.roundScores = [40, 66];
    state.roundResult = {
      winner: 1,
      gamePoints: 1,
      reason: "closed_failed",
    };

    expect(calculateWinPoints(state, 0)).toBe(3);
  });

  test("uses normal scoring when the closer wins", () => {
    const state = makeState([[], []]);
    state.roundScores = [20, 66];
    state.roundResult = {
      winner: 1,
      gamePoints: 2,
      reason: "exhausted",
    };

    expect(calculateWinPoints(state, 1)).toBe(2);
  });
});

describe("declare66", () => {
  test("awards the declaring player when they have exactly 66 points", () => {
    const state = makeState([[], []]);
    state.roundScores = [DECLARE_THRESHOLD, 10];

    const nextState = declare66(state, 0);

    expect(nextState.roundResult).toEqual({
      winner: 0,
      gamePoints: 2,
      reason: "declared_66",
    });
  });

  test("awards the declaring player when they have more than 66 points", () => {
    const state = makeState([[], []]);
    state.roundScores = [DECLARE_THRESHOLD + 6, 33];

    const nextState = declare66(state, 0);

    expect(nextState.roundResult).toEqual({
      winner: 0,
      gamePoints: 1,
      reason: "declared_66",
    });
  });

  test("penalizes a false declaration with 2 game points", () => {
    const state = makeState([[], []]);
    state.roundScores = [DECLARE_THRESHOLD - 1, 10];

    const nextState = declare66(state, 0);

    expect(nextState.roundResult).toEqual({
      winner: 1,
      gamePoints: 2,
      reason: "false_declaration",
    });
  });

  test("calculates game points based on opponent score tiers", () => {
    const baseState = makeState([[], []]);

    baseState.roundScores = [DECLARE_THRESHOLD, 0];
    expect(declare66(baseState, 0).roundResult).toEqual({
      winner: 0,
      gamePoints: 3,
      reason: "declared_66",
    });

    baseState.roundScores = [DECLARE_THRESHOLD, 32];
    expect(declare66(baseState, 0).roundResult).toEqual({
      winner: 0,
      gamePoints: 2,
      reason: "declared_66",
    });

    baseState.roundScores = [DECLARE_THRESHOLD, 33];
    expect(declare66(baseState, 0).roundResult).toEqual({
      winner: 0,
      gamePoints: 1,
      reason: "declared_66",
    });
  });

  test("awards the second player when they declare with enough points", () => {
    const state = makeState([[], []]);
    state.roundScores = [12, DECLARE_THRESHOLD + 4];

    const nextState = declare66(state, 1);

    expect(nextState.roundResult).toEqual({
      winner: 1,
      gamePoints: 2,
      reason: "declared_66",
    });
  });

  test("penalizes the second player on a false declaration", () => {
    const state = makeState([[], []]);
    state.roundScores = [12, DECLARE_THRESHOLD - 2];

    const nextState = declare66(state, 1);

    expect(nextState.roundResult).toEqual({
      winner: 0,
      gamePoints: 2,
      reason: "false_declaration",
    });
  });

  test("throws when declaring after the round already ended", () => {
    const state = makeState([[], []]);
    state.roundScores = [DECLARE_THRESHOLD, 0];

    const finishedState = declare66(state, 0);

    expect(() => declare66(finishedState, 0)).toThrow("Round already ended.");
  });
});

describe("canExchangeTrump9", () => {
  test("returns false when player does not hold the trump 9", () => {
    const state = makeState(
      [
        [
          { suit: "hearts", rank: "K" },
          { suit: "spades", rank: "9" },
        ],
        [],
      ],
      [],
      { stock: createDeck().slice(0, 3), trumpSuit: "hearts", leader: 0 },
    );

    expect(canExchangeTrump9(state, 0)).toBe(false);
  });

  test("returns false when stock has two or fewer cards", () => {
    const state = makeState(
      [[{ suit: "clubs", rank: "9" }], []],
      [],
      { stock: createDeck().slice(0, 2), trumpSuit: "clubs", leader: 0 },
    );

    expect(canExchangeTrump9(state, 0)).toBe(false);
  });

  test("returns false when player is not the leader", () => {
    const state = makeState(
      [[{ suit: "diamonds", rank: "9" }], []],
      [],
      { stock: createDeck().slice(0, 4), trumpSuit: "diamonds", leader: 1 },
    );

    expect(canExchangeTrump9(state, 0)).toBe(false);
  });

  test("returns false when trump card is missing", () => {
    const baseState = makeState(
      [[{ suit: "hearts", rank: "9" }], []],
      [],
      { stock: createDeck().slice(0, 4), trumpSuit: "hearts", leader: 0 },
    );

    const state: GameState = { ...baseState, trumpCard: null };

    expect(canExchangeTrump9(state, 0)).toBe(false);
  });

  test("returns false when leader has already started the trick", () => {
    const state = makeState(
      [[{ suit: "spades", rank: "9" }], []],
      [],
      { stock: createDeck().slice(0, 4), trumpSuit: "spades", leader: 0 },
    );
    state.currentTrick = {
      leaderIndex: 0,
      leaderCard: { suit: "hearts", rank: "A" },
    };

    expect(canExchangeTrump9(state, 0)).toBe(false);
  });

  test("returns true when all conditions are met", () => {
    const state = makeState(
      [[{ suit: "spades", rank: "9" }], []],
      [],
      { stock: createDeck().slice(0, 5), trumpSuit: "spades", leader: 0 },
    );

    expect(canExchangeTrump9(state, 0)).toBe(true);
  });

  test("returns true for player 1 when all conditions are met", () => {
    const state = makeState(
      [[], [{ suit: "hearts", rank: "9" }]],
      [],
      { stock: createDeck().slice(0, 4), trumpSuit: "hearts", leader: 1 },
    );

    expect(canExchangeTrump9(state, 1)).toBe(true);
  });
});

describe("hasPotentialMarriage", () => {
  test("returns true when hand has king and queen of suit", () => {
    const hand = [
      { suit: "hearts", rank: "K" },
      { suit: "hearts", rank: "Q" },
      { suit: "spades", rank: "A" },
    ];

    expect(hasPotentialMarriage(hand, "hearts")).toBe(true);
  });

  test("returns false when missing a required card", () => {
    const hand = [
      { suit: "clubs", rank: "K" },
      { suit: "clubs", rank: "A" },
      { suit: "spades", rank: "Q" },
    ];

    expect(hasPotentialMarriage(hand, "clubs")).toBe(false);
  });

  test("returns false for an empty hand", () => {
    expect(hasPotentialMarriage([], "hearts")).toBe(false);
  });

  test("returns false when suit is not present in hand", () => {
    const hand = [
      { suit: "spades", rank: "K" },
      { suit: "spades", rank: "Q" },
      { suit: "clubs", rank: "A" },
    ];

    expect(hasPotentialMarriage(hand, "diamonds")).toBe(false);
  });
});

describe("exchangeTrump9", () => {
  test("swaps the trump 9 with the trump card and keeps trump suit", () => {
    const state = makeState(
      [
        [
          { suit: "hearts", rank: "9" },
          { suit: "spades", rank: "A" },
        ],
        [{ suit: "clubs", rank: "K" }],
      ],
      [],
      {
        stock: createDeck().slice(0, 4),
        trumpSuit: "hearts",
        trumpCard: { suit: "hearts", rank: "A" },
        leader: 0,
      },
    );

    const nextState = exchangeTrump9(state, 0);

    expect(nextState.trumpCard).toEqual({ suit: "hearts", rank: "9" });
    expect(nextState.trumpSuit).toBe("hearts");
    expect(nextState.playerHands[0]).toEqual([
      { suit: "spades", rank: "A" },
      { suit: "hearts", rank: "A" },
    ]);
    expect(nextState.playerHands[1]).toEqual([{ suit: "clubs", rank: "K" }]);
    expect(state.playerHands[0]).toEqual([
      { suit: "hearts", rank: "9" },
      { suit: "spades", rank: "A" },
    ]);
    expect(state.playerHands[1]).toEqual([{ suit: "clubs", rank: "K" }]);
  });

  test("swaps correctly for player 1", () => {
    const state = makeState(
      [
        [{ suit: "spades", rank: "K" }],
        [
          { suit: "diamonds", rank: "9" },
          { suit: "clubs", rank: "Q" },
        ],
      ],
      [],
      {
        stock: createDeck().slice(0, 4),
        trumpSuit: "diamonds",
        trumpCard: { suit: "diamonds", rank: "A" },
        leader: 1,
      },
    );

    const nextState = exchangeTrump9(state, 1);

    expect(nextState.trumpCard).toEqual({ suit: "diamonds", rank: "9" });
    expect(nextState.trumpSuit).toBe("diamonds");
    expect(nextState.playerHands[0]).toEqual([{ suit: "spades", rank: "K" }]);
    expect(nextState.playerHands[1]).toEqual([
      { suit: "clubs", rank: "Q" },
      { suit: "diamonds", rank: "A" },
    ]);
    expect(state.playerHands[0]).toEqual([{ suit: "spades", rank: "K" }]);
    expect(state.playerHands[1]).toEqual([
      { suit: "diamonds", rank: "9" },
      { suit: "clubs", rank: "Q" },
    ]);
  });

  test("throws when exchange is not allowed", () => {
    const state = makeState(
      [[{ suit: "hearts", rank: "9" }], []],
      [],
      { stock: createDeck().slice(0, 2), trumpSuit: "hearts", leader: 0 },
    );

    expect(() => exchangeTrump9(state, 0)).toThrow("Player cannot exchange the trump 9.");
  });
});

function makeState(
  playerHands: [GameState["playerHands"][0], GameState["playerHands"][1]],
  declaredMarriages: GameState["declaredMarriages"] = [],
  overrides: Partial<Pick<GameState, "stock" | "trumpSuit" | "trumpCard" | "leader">> = {},
): GameState {
  const trumpSuit = overrides.trumpSuit ?? overrides.trumpCard?.suit ?? "hearts";
  const trumpCard = overrides.trumpCard ?? { suit: trumpSuit, rank: "9" };

  return {
    playerHands,
    stock: overrides.stock ?? [],
    trumpCard,
    trumpSuit,
    leader: overrides.leader ?? 0,
    isClosed: false,
    currentTrick: null,
    lastCompletedTrick: null,
    closedBy: null,
    wonTricks: [[], []],
    roundScores: [0, 0],
    declaredMarriages,
    canDeclareWindow: null,
    roundResult: null,
  };
}

function makeTrickState({
  leaderHand,
  followerHand,
  trumpSuit = "spades",
  isClosed = false,
  stock = [],
}: {
  leaderHand: GameState["playerHands"][0];
  followerHand: GameState["playerHands"][1];
  trumpSuit?: GameState["trumpSuit"];
  isClosed?: GameState["isClosed"];
  stock?: GameState["stock"];
}): GameState {
  return {
    playerHands: [leaderHand, followerHand],
    stock,
    trumpCard: { suit: trumpSuit, rank: "9" },
    trumpSuit,
    isClosed,
    currentTrick: null,
    lastCompletedTrick: null,
    closedBy: null,
    wonTricks: [[], []],
    roundScores: [0, 0],
    declaredMarriages: [],
    canDeclareWindow: null,
    roundResult: null,
  };
}

describe("canDeclareMarriage", () => {
  test("returns true when player has king and queen and suit not declared", () => {
    const state = makeState([
      [
        { suit: "hearts", rank: "K" },
        { suit: "hearts", rank: "Q" },
        { suit: "spades", rank: "A" },
      ],
      [],
    ]);

    expect(canDeclareMarriage(state, 0, "hearts")).toBe(true);
  });

  test("returns true for second player when they have king and queen", () => {
    const state = makeState([
      [],
      [
        { suit: "spades", rank: "K" },
        { suit: "spades", rank: "Q" },
        { suit: "clubs", rank: "A" },
      ],
    ]);

    expect(canDeclareMarriage(state, 1, "spades")).toBe(true);
  });

  test("returns false when player is missing a required card", () => {
    const state = makeState([
      [
        { suit: "diamonds", rank: "K" },
        { suit: "diamonds", rank: "A" },
      ],
      [],
    ]);

    expect(canDeclareMarriage(state, 0, "diamonds")).toBe(false);
  });

  test("returns false when suit already declared", () => {
    const state = makeState(
      [
        [
          { suit: "clubs", rank: "K" },
          { suit: "clubs", rank: "Q" },
        ],
        [],
      ],
      ["clubs"],
    );

    expect(canDeclareMarriage(state, 0, "clubs")).toBe(false);
  });
});

describe("findDeclareableMarriages", () => {
  test("returns empty array when player has no declarable marriages", () => {
    const state = makeState([
      [
        { suit: "hearts", rank: "K" },
        { suit: "diamonds", rank: "Q" },
      ],
      [],
    ]);

    expect(findDeclareableMarriages(state, 0)).toEqual([]);
  });

  test("returns all suits player can declare", () => {
    const state = makeState(
      [
        [
          { suit: "hearts", rank: "K" },
          { suit: "hearts", rank: "Q" },
          { suit: "spades", rank: "K" },
          { suit: "spades", rank: "Q" },
          { suit: "diamonds", rank: "K" },
        ],
        [],
      ],
      ["hearts"],
    );

    expect(findDeclareableMarriages(state, 0)).toEqual(["spades"]);
  });

  test("returns multiple suits when player can declare more than one", () => {
    const state = makeState([
      [
        { suit: "clubs", rank: "K" },
        { suit: "clubs", rank: "Q" },
        { suit: "diamonds", rank: "K" },
        { suit: "diamonds", rank: "Q" },
      ],
      [],
    ]);

    expect(findDeclareableMarriages(state, 0)).toEqual(["diamonds", "clubs"]);
  });
});

describe("declareMarriage", () => {
  test("adds points and records the declared suit", () => {
    const state = makeState([
      [
        { suit: "clubs", rank: "K" },
        { suit: "clubs", rank: "Q" },
      ],
      [],
    ]);

    const nextState = declareMarriage(state, 0, "clubs");

    expect(nextState.declaredMarriages).toEqual(["clubs"]);
    expect(nextState.roundScores[0]).toBe(MARRIAGE_POINTS);
    expect(state.declaredMarriages).toEqual([]);
  });

  test("opens the declare window for the declaring player", () => {
    const state = makeState([
      [
        { suit: "hearts", rank: "K" },
        { suit: "hearts", rank: "Q" },
      ],
      [],
    ]);

    const nextState = declareMarriage(state, 0, "hearts");

    expect(nextState.canDeclareWindow).toBe(0);
  });

  test("awards trump marriage points when suit matches trump", () => {
    const state = makeState([
      [
        { suit: "hearts", rank: "K" },
        { suit: "hearts", rank: "Q" },
      ],
      [],
    ]);

    const nextState = declareMarriage(state, 0, "hearts");

    expect(nextState.roundScores[0]).toBe(TRUMP_MARRIAGE_POINTS);
  });

  test("awards regular marriage points when suit is not trump", () => {
    const state = makeState([
      [
        { suit: "spades", rank: "K" },
        { suit: "spades", rank: "Q" },
      ],
      [],
    ]);

    const nextState = declareMarriage(state, 0, "spades");

    expect(nextState.roundScores[0]).toBe(MARRIAGE_POINTS);
  });

  test("awards points to the declaring second player", () => {
    const state = makeState([
      [],
      [
        { suit: "clubs", rank: "K" },
        { suit: "clubs", rank: "Q" },
      ],
    ]);

    const nextState = declareMarriage(state, 1, "clubs");

    expect(nextState.roundScores[1]).toBe(MARRIAGE_POINTS);
  });

  test("throws when declaring a suit already declared", () => {
    const state = makeState(
      [
        [
          { suit: "diamonds", rank: "K" },
          { suit: "diamonds", rank: "Q" },
        ],
        [],
      ],
      ["diamonds"],
    );

    expect(() => declareMarriage(state, 0, "diamonds")).toThrow();
  });

  test("throws when player lacks king and queen", () => {
    const state = makeState([
      [
        { suit: "spades", rank: "K" },
        { suit: "spades", rank: "A" },
      ],
      [],
    ]);

    expect(() => declareMarriage(state, 0, "spades")).toThrow();
  });
});

describe("drawFromStock", () => {
  test("draws top cards for winner and loser in order", () => {
    const state: GameState = {
      ...makeState([
        [{ suit: "hearts", rank: "A" }],
        [{ suit: "clubs", rank: "Q" }],
      ]),
      stock: [
        { suit: "clubs", rank: "9" },
        { suit: "spades", rank: "10" },
        { suit: "diamonds", rank: "K" },
      ],
      trumpCard: { suit: "spades", rank: "A" },
      trumpSuit: "spades",
    };

    const nextState = drawFromStock(state, 0);

    expect(nextState.playerHands[0]).toEqual([
      { suit: "hearts", rank: "A" },
      { suit: "clubs", rank: "9" },
    ]);
    expect(nextState.playerHands[1]).toEqual([
      { suit: "clubs", rank: "Q" },
      { suit: "spades", rank: "10" },
    ]);
    expect(nextState.stock).toEqual([{ suit: "diamonds", rank: "K" }]);
    expect(state.stock).toEqual([
      { suit: "clubs", rank: "9" },
      { suit: "spades", rank: "10" },
      { suit: "diamonds", rank: "K" },
    ]);
  });

  test("uses trump card for the final draw and clears it", () => {
    const state: GameState = {
      ...makeState([
        [{ suit: "hearts", rank: "A" }],
        [{ suit: "clubs", rank: "Q" }],
      ]),
      stock: [{ suit: "clubs", rank: "9" }],
      trumpCard: { suit: "spades", rank: "A" },
      trumpSuit: "spades",
    };

    const nextState = drawFromStock(state, 0);

    expect(nextState.playerHands[0]).toEqual([
      { suit: "hearts", rank: "A" },
      { suit: "clubs", rank: "9" },
    ]);
    expect(nextState.playerHands[1]).toEqual([
      { suit: "clubs", rank: "Q" },
      { suit: "spades", rank: "A" },
    ]);
    expect(nextState.stock).toEqual([]);
    expect(nextState.trumpCard).toBeNull();
    expect(nextState.trumpSuit).toBe("spades");
  });

  test("uses trump card for final draw when player one wins", () => {
    const state: GameState = {
      ...makeState([
        [{ suit: "clubs", rank: "K" }],
        [{ suit: "hearts", rank: "10" }],
      ]),
      stock: [{ suit: "diamonds", rank: "Q" }],
      trumpCard: { suit: "spades", rank: "A" },
      trumpSuit: "spades",
    };

    const nextState = drawFromStock(state, 1);

    expect(nextState.playerHands[1]).toEqual([
      { suit: "hearts", rank: "10" },
      { suit: "diamonds", rank: "Q" },
    ]);
    expect(nextState.playerHands[0]).toEqual([
      { suit: "clubs", rank: "K" },
      { suit: "spades", rank: "A" },
    ]);
    expect(nextState.stock).toEqual([]);
    expect(nextState.trumpCard).toBeNull();
    expect(nextState.trumpSuit).toBe("spades");
  });

  test("winner draws first (top card) even when player one wins", () => {
    const state: GameState = {
      ...makeState([
        [{ suit: "hearts", rank: "J" }],
        [{ suit: "diamonds", rank: "Q" }],
      ]),
      stock: [
        { suit: "spades", rank: "A" },
        { suit: "clubs", rank: "K" },
        { suit: "hearts", rank: "9" },
      ],
      trumpCard: { suit: "diamonds", rank: "A" },
      trumpSuit: "diamonds",
    };

    const nextState = drawFromStock(state, 1);

    expect(nextState.playerHands[1]).toEqual([
      { suit: "diamonds", rank: "Q" },
      { suit: "spades", rank: "A" },
    ]);
    expect(nextState.playerHands[0]).toEqual([
      { suit: "hearts", rank: "J" },
      { suit: "clubs", rank: "K" },
    ]);
    expect(nextState.stock).toEqual([{ suit: "hearts", rank: "9" }]);
  });

  test("returns state unchanged when stock is empty", () => {
    const state: GameState = {
      ...makeState([[], []]),
      stock: [],
      trumpCard: { suit: "spades", rank: "A" },
      trumpSuit: "spades",
    };

    const nextState = drawFromStock(state, 1);

    expect(nextState).toBe(state);
    expect(nextState).toEqual(state);
  });
});

describe("playTrick", () => {
  test("plays a trick, removes cards, and awards the winner", () => {
    const state: GameState = {
      playerHands: [
        [
          { suit: "hearts", rank: "A" },
          { suit: "clubs", rank: "9" },
        ],
        [{ suit: "hearts", rank: "9" }],
      ],
      stock: [],
      trumpCard: { suit: "spades", rank: "9" },
      trumpSuit: "spades",
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

    const nextState = playTrick(
      state,
      0,
      { suit: "hearts", rank: "A" },
      { suit: "hearts", rank: "9" },
    );

    expect(nextState.game.playerHands[0]).toEqual([{ suit: "clubs", rank: "9" }]);
    expect(nextState.game.playerHands[1]).toEqual([]);
    expect(nextState.game.wonTricks[0]).toEqual([
      { suit: "hearts", rank: "A" },
      { suit: "hearts", rank: "9" },
    ]);
    expect(nextState.game.wonTricks[1]).toEqual([]);
    expect(nextState.game.roundScores).toEqual([11, 0]);
    expect(nextState.game.canDeclareWindow).toBe(0);
    expect(nextState.game.lastCompletedTrick).toEqual({
      leaderIndex: 0,
      leaderCard: { suit: "hearts", rank: "A" },
      followerCard: { suit: "hearts", rank: "9" },
    });
  });

  test("accumulates scores and appends to existing won tricks", () => {
    const state: GameState = {
      playerHands: [[{ suit: "spades", rank: "9" }], [{ suit: "hearts", rank: "10" }]],
      stock: [],
      trumpCard: { suit: "spades", rank: "A" },
      trumpSuit: "spades",
      isClosed: false,
      leader: 0,
      currentTrick: null,
      lastCompletedTrick: null,
      closedBy: null,
      wonTricks: [
        [{ suit: "clubs", rank: "K" }],
        [{ suit: "diamonds", rank: "Q" }],
      ],
      roundScores: [10, 5],
      declaredMarriages: [],
      canDeclareWindow: null,
      roundResult: null,
    };

    const nextState = playTrick(
      state,
      1,
      { suit: "hearts", rank: "10" },
      { suit: "spades", rank: "9" },
    );

    expect(nextState.game.playerHands[0]).toEqual([]);
    expect(nextState.game.playerHands[1]).toEqual([]);
    expect(nextState.game.wonTricks[0]).toEqual([
      { suit: "clubs", rank: "K" },
      { suit: "hearts", rank: "10" },
      { suit: "spades", rank: "9" },
    ]);
    expect(nextState.game.wonTricks[1]).toEqual([{ suit: "diamonds", rank: "Q" }]);
    expect(nextState.game.roundScores).toEqual([20, 5]);
    expect(nextState.game.canDeclareWindow).toBe(0);
    expect(nextState.game.lastCompletedTrick).toEqual({
      leaderIndex: 1,
      leaderCard: { suit: "hearts", rank: "10" },
      followerCard: { suit: "spades", rank: "9" },
    });
  });

  test("throws when the leader card is not in hand", () => {
    const state: GameState = {
      playerHands: [[{ suit: "hearts", rank: "A" }], [{ suit: "clubs", rank: "9" }]],
      stock: [],
      trumpCard: { suit: "spades", rank: "9" },
      trumpSuit: "spades",
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

    expect(() =>
      playTrick(
        state,
        0,
        { suit: "diamonds", rank: "A" },
        { suit: "clubs", rank: "9" },
      ),
    ).toThrow("Leader card not found in hand.");
  });

  test("throws when the follower card is not in hand", () => {
    const state: GameState = {
      playerHands: [[{ suit: "hearts", rank: "A" }], [{ suit: "clubs", rank: "9" }]],
      stock: [],
      trumpCard: { suit: "spades", rank: "9" },
      trumpSuit: "spades",
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

    expect(() =>
      playTrick(
        state,
        0,
        { suit: "hearts", rank: "A" },
        { suit: "diamonds", rank: "9" },
      ),
    ).toThrow("Follower card not found in hand.");
  });

  test("must head in suit when possible in closed deck play", () => {
    const state = makeTrickState({
      leaderHand: [{ suit: "hearts", rank: "K" }],
      followerHand: [
        { suit: "hearts", rank: "A" },
        { suit: "hearts", rank: "9" },
        { suit: "clubs", rank: "9" },
      ],
      isClosed: true,
    });

    expect(() =>
      playTrick(
        state,
        0,
        { suit: "hearts", rank: "K" },
        { suit: "hearts", rank: "9" },
      ),
    ).toThrow("Follower card must follow suit or trump when the deck is closed or exhausted.");
  });

  test("allows lower led suit when follower cannot head in suit", () => {
    const state = makeTrickState({
      leaderHand: [{ suit: "hearts", rank: "A" }],
      followerHand: [
        { suit: "hearts", rank: "9" },
        { suit: "hearts", rank: "Q" },
        { suit: "clubs", rank: "9" },
      ],
      isClosed: true,
    });

    expect(() =>
      playTrick(
        state,
        0,
        { suit: "hearts", rank: "A" },
        { suit: "hearts", rank: "9" },
      ),
    ).not.toThrow();
  });

  test("must play trump when void in led suit in closed deck play", () => {
    const state = makeTrickState({
      leaderHand: [{ suit: "hearts", rank: "K" }],
      followerHand: [
        { suit: "spades", rank: "9" },
        { suit: "clubs", rank: "A" },
      ],
      trumpSuit: "spades",
      isClosed: true,
    });

    expect(() =>
      playTrick(
        state,
        0,
        { suit: "hearts", rank: "K" },
        { suit: "clubs", rank: "A" },
      ),
    ).toThrow("Follower card must follow suit or trump when the deck is closed or exhausted.");
  });

  test("must head with trump when led card is trump and follower can beat", () => {
    const state = makeTrickState({
      leaderHand: [{ suit: "spades", rank: "J" }],
      followerHand: [
        { suit: "spades", rank: "A" },
        { suit: "spades", rank: "9" },
      ],
      trumpSuit: "spades",
      isClosed: true,
    });

    expect(() =>
      playTrick(
        state,
        0,
        { suit: "spades", rank: "J" },
        { suit: "spades", rank: "9" },
      ),
    ).toThrow("Follower card must follow suit or trump when the deck is closed or exhausted.");
  });

  test("allows any trump when follower cannot head a led trump", () => {
    const state = makeTrickState({
      leaderHand: [{ suit: "spades", rank: "A" }],
      followerHand: [
        { suit: "spades", rank: "9" },
        { suit: "spades", rank: "K" },
        { suit: "hearts", rank: "9" },
      ],
      trumpSuit: "spades",
      isClosed: true,
    });

    expect(() =>
      playTrick(
        state,
        0,
        { suit: "spades", rank: "A" },
        { suit: "spades", rank: "9" },
      ),
    ).not.toThrow();
  });

  test("allows any card when follower is void in led suit and trumps", () => {
    const state = makeTrickState({
      leaderHand: [{ suit: "hearts", rank: "K" }],
      followerHand: [
        { suit: "clubs", rank: "9" },
        { suit: "diamonds", rank: "A" },
      ],
      trumpSuit: "spades",
      isClosed: true,
    });

    expect(() =>
      playTrick(
        state,
        0,
        { suit: "hearts", rank: "K" },
        { suit: "clubs", rank: "9" },
      ),
    ).not.toThrow();
  });

  test("allows free play when the deck is open and stock has cards", () => {
    const state = makeTrickState({
      leaderHand: [{ suit: "hearts", rank: "K" }],
      followerHand: [
        { suit: "hearts", rank: "A" },
        { suit: "clubs", rank: "9" },
      ],
      trumpSuit: "spades",
      isClosed: false,
      stock: [{ suit: "diamonds", rank: "9" }],
    });

    expect(() =>
      playTrick(
        state,
        0,
        { suit: "hearts", rank: "K" },
        { suit: "clubs", rank: "9" },
      ),
    ).not.toThrow();
  });
});

describe("getValidFollowerCards", () => {
  test("returns the full hand when the deck is open", () => {
    const hand = [
      { suit: "hearts", rank: "9" },
      { suit: "spades", rank: "A" },
      { suit: "clubs", rank: "Q" },
    ];

    expect(
      getValidFollowerCards(
        hand,
        { suit: "hearts", rank: "K" },
        "spades",
        false,
      ),
    ).toEqual(hand);
  });

  test("returns led suit cards that beat the led card when possible", () => {
    const hand = [
      { suit: "hearts", rank: "9" },
      { suit: "hearts", rank: "A" },
      { suit: "hearts", rank: "10" },
      { suit: "clubs", rank: "K" },
    ];

    expect(
      getValidFollowerCards(
        hand,
        { suit: "hearts", rank: "K" },
        "spades",
        true,
      ),
    ).toEqual([
      { suit: "hearts", rank: "A" },
      { suit: "hearts", rank: "10" },
    ]);
  });

  test("returns all led suit cards when none can beat the led card", () => {
    const hand = [
      { suit: "hearts", rank: "9" },
      { suit: "hearts", rank: "Q" },
      { suit: "clubs", rank: "A" },
    ];

    expect(
      getValidFollowerCards(
        hand,
        { suit: "hearts", rank: "K" },
        "spades",
        true,
      ),
    ).toEqual([
      { suit: "hearts", rank: "9" },
      { suit: "hearts", rank: "Q" },
    ]);
  });

  test("returns higher trumps when the led card is trump", () => {
    const hand = [
      { suit: "hearts", rank: "A" },
      { suit: "spades", rank: "K" },
      { suit: "spades", rank: "A" },
      { suit: "clubs", rank: "9" },
    ];

    expect(
      getValidFollowerCards(
        hand,
        { suit: "spades", rank: "J" },
        "spades",
        true,
      ),
    ).toEqual([
      { suit: "spades", rank: "K" },
      { suit: "spades", rank: "A" },
    ]);
  });

  test("returns all trumps when none can beat the led trump", () => {
    const hand = [
      { suit: "spades", rank: "9" },
      { suit: "spades", rank: "K" },
      { suit: "hearts", rank: "A" },
    ];

    expect(
      getValidFollowerCards(
        hand,
        { suit: "spades", rank: "A" },
        "spades",
        true,
      ),
    ).toEqual([
      { suit: "spades", rank: "9" },
      { suit: "spades", rank: "K" },
    ]);
  });

  test("returns all trumps when no led suit cards are present", () => {
    const hand = [
      { suit: "clubs", rank: "9" },
      { suit: "spades", rank: "J" },
      { suit: "spades", rank: "9" },
    ];

    expect(
      getValidFollowerCards(
        hand,
        { suit: "hearts", rank: "A" },
        "spades",
        true,
      ),
    ).toEqual([
      { suit: "spades", rank: "J" },
      { suit: "spades", rank: "9" },
    ]);
  });

  test("returns the full hand when no led suit or trump cards exist", () => {
    const hand = [
      { suit: "clubs", rank: "9" },
      { suit: "diamonds", rank: "J" },
    ];

    expect(
      getValidFollowerCards(
        hand,
        { suit: "hearts", rank: "A" },
        "spades",
        true,
      ),
    ).toEqual(hand);
  });
});
