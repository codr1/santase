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
  declare66,
  declareMarriage,
  dealInitialHands,
  drawFromStock,
  findDeclareableMarriages,
  getValidFollowerCards,
  getStockCount,
  hasPotentialMarriage,
  isDeckClosedOrExhausted,
  playTrick,
  type GameState,
} from "./state";

describe("dealInitialHands", () => {
  test("deals 6 cards per player", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck);

    expect(state.playerHands[0]).toHaveLength(6);
    expect(state.playerHands[1]).toHaveLength(6);
  });

  test("leaves 11 cards in stock", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck);

    expect(state.stock).toHaveLength(11);
  });

  test("uses a trump card from the original deck", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck);

    expect(state.trumpCard).not.toBeNull();
    expect(deck).toContainEqual(state.trumpCard);
  });

  test("sets the trump suit from the trump card", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck);

    expect(state.trumpCard).not.toBeNull();
    expect(state.trumpSuit).toBe(state.trumpCard.suit);
  });

  test("defaults isClosed to false", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck);

    expect(state.isClosed).toBe(false);
  });

  test("initializes declared marriages as empty", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck);

    expect(state.declaredMarriages).toEqual([]);
  });

  test("sets player 0 as the initial leader", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck);

    expect(state.leader).toBe(0);
  });
});

describe("getStockCount", () => {
  test("returns the stock size", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck);

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
    const baseState = dealInitialHands(createDeck());
    const testState: GameState = { ...baseState, ...state };

    expect(isDeckClosedOrExhausted(testState)).toBe(expected);
describe("canDeclare66", () => {
  test("returns true when player has exactly 66 points", () => {
    const state = makeState([[], []]);
    state.roundScores = [DECLARE_THRESHOLD, 10];

    expect(canDeclare66(state, 0)).toBe(true);
  });

  test("returns true when player is above 66 points", () => {
    const state = makeState([[], []]);
    state.roundScores = [DECLARE_THRESHOLD + 6, 0];

    expect(canDeclare66(state, 0)).toBe(true);
  });

  test("returns false when player is below 66 points", () => {
    const state = makeState([[], []]);
    state.roundScores = [DECLARE_THRESHOLD - 1, DECLARE_THRESHOLD + 14];

    expect(canDeclare66(state, 0)).toBe(false);
  });

  test("returns true when player two meets the threshold", () => {
    const state = makeState([[], []]);
    state.roundScores = [10, DECLARE_THRESHOLD];

    expect(canDeclare66(state, 1)).toBe(true);
  });

  test("returns false when the round already ended", () => {
    const state = makeState([[], []]);
    state.roundScores = [DECLARE_THRESHOLD, 0];
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

  test("penalizes a false declaration with 3 game points", () => {
    const state = makeState([[], []]);
    state.roundScores = [DECLARE_THRESHOLD - 1, 10];

    const nextState = declare66(state, 0);

    expect(nextState.roundResult).toEqual({
      winner: 1,
      gamePoints: 3,
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
      gamePoints: 3,
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

function makeState(
  playerHands: [GameState["playerHands"][0], GameState["playerHands"][1]],
  declaredMarriages: GameState["declaredMarriages"] = [],
): GameState {
  return {
    playerHands,
    stock: [],
    trumpCard: { suit: "hearts", rank: "9" },
    trumpSuit: "hearts",
    isClosed: false,
    leader: 0,
    wonTricks: [[], []],
    roundScores: [0, 0],
    declaredMarriages,
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
    wonTricks: [[], []],
    roundScores: [0, 0],
    declaredMarriages: [],
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
      wonTricks: [[], []],
      roundScores: [0, 0],
      declaredMarriages: [],
      roundResult: null,
    };

    const nextState = playTrick(
      state,
      0,
      { suit: "hearts", rank: "A" },
      { suit: "hearts", rank: "9" },
    );

    expect(nextState.playerHands[0]).toEqual([{ suit: "clubs", rank: "9" }]);
    expect(nextState.playerHands[1]).toEqual([]);
    expect(nextState.wonTricks[0]).toEqual([
      { suit: "hearts", rank: "A" },
      { suit: "hearts", rank: "9" },
    ]);
    expect(nextState.wonTricks[1]).toEqual([]);
    expect(nextState.roundScores).toEqual([11, 0]);
  });

  test("accumulates scores and appends to existing won tricks", () => {
    const state: GameState = {
      playerHands: [[{ suit: "spades", rank: "9" }], [{ suit: "hearts", rank: "10" }]],
      stock: [],
      trumpCard: { suit: "spades", rank: "A" },
      trumpSuit: "spades",
      isClosed: false,
      leader: 0,
      wonTricks: [
        [{ suit: "clubs", rank: "K" }],
        [{ suit: "diamonds", rank: "Q" }],
      ],
      roundScores: [10, 5],
      declaredMarriages: [],
      roundResult: null,
    };

    const nextState = playTrick(
      state,
      1,
      { suit: "hearts", rank: "10" },
      { suit: "spades", rank: "9" },
    );

    expect(nextState.playerHands[0]).toEqual([]);
    expect(nextState.playerHands[1]).toEqual([]);
    expect(nextState.wonTricks[0]).toEqual([
      { suit: "clubs", rank: "K" },
      { suit: "hearts", rank: "10" },
      { suit: "spades", rank: "9" },
    ]);
    expect(nextState.wonTricks[1]).toEqual([{ suit: "diamonds", rank: "Q" }]);
    expect(nextState.roundScores).toEqual([20, 5]);
  });

  test("throws when the leader card is not in hand", () => {
    const state: GameState = {
      playerHands: [[{ suit: "hearts", rank: "A" }], [{ suit: "clubs", rank: "9" }]],
      stock: [],
      trumpCard: { suit: "spades", rank: "9" },
      trumpSuit: "spades",
      isClosed: false,
      leader: 0,
      wonTricks: [[], []],
      roundScores: [0, 0],
      declaredMarriages: [],
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
      wonTricks: [[], []],
      roundScores: [0, 0],
      declaredMarriages: [],
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
