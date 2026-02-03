import { describe, expect, test } from "bun:test";
import { MARRIAGE_POINTS, TRUMP_MARRIAGE_POINTS, createDeck } from "./cards";
import {
  canDeclareMarriage,
  declareMarriage,
  dealInitialHands,
  drawFromStock,
  findDeclareableMarriages,
  getStockCount,
  hasPotentialMarriage,
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

    expect(deck).toContainEqual(state.trumpCard);
  });

  test("sets the trump suit from the trump card", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck);

    expect(state.trumpSuit).toBe(state.trumpCard.suit);
  });

  test("initializes declared marriages as empty", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck);

    expect(state.declaredMarriages).toEqual([]);
  });
});

describe("getStockCount", () => {
  test("returns the stock size", () => {
    const deck = createDeck();
    const state = dealInitialHands(deck);

    expect(getStockCount(state)).toBe(11);
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
    wonTricks: [[], []],
    roundScores: [0, 0],
    declaredMarriages,
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
  test("draws top cards for winner and loser", () => {
    const state: GameState = {
      playerHands: [
        [{ suit: "hearts", rank: "A" }],
        [{ suit: "clubs", rank: "Q" }],
      ],
      stock: [
        { suit: "clubs", rank: "9" },
        { suit: "spades", rank: "10" },
        { suit: "diamonds", rank: "K" },
      ],
      trumpCard: { suit: "spades", rank: "A" },
      trumpSuit: "spades",
      wonTricks: [[], []],
      roundScores: [0, 0],
      declaredMarriages: [],
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

  test("assigns cards correctly when player one wins", () => {
    const state: GameState = {
      playerHands: [
        [{ suit: "hearts", rank: "J" }],
        [{ suit: "diamonds", rank: "Q" }],
      ],
      stock: [
        { suit: "spades", rank: "A" },
        { suit: "clubs", rank: "K" },
        { suit: "hearts", rank: "9" },
      ],
      trumpCard: { suit: "diamonds", rank: "A" },
      trumpSuit: "diamonds",
      wonTricks: [[], []],
      roundScores: [0, 0],
      declaredMarriages: [],
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

  test("throws when stock has fewer than two cards", () => {
    const state: GameState = {
      playerHands: [[], []],
      stock: [{ suit: "clubs", rank: "9" }],
      trumpCard: { suit: "spades", rank: "A" },
      trumpSuit: "spades",
      wonTricks: [[], []],
      roundScores: [0, 0],
      declaredMarriages: [],
    };

    expect(() => drawFromStock(state, 1)).toThrow(
      "Stock does not have enough cards to draw.",
    );
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
      wonTricks: [[], []],
      roundScores: [0, 0],
      declaredMarriages: [],
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
      wonTricks: [
        [{ suit: "clubs", rank: "K" }],
        [{ suit: "diamonds", rank: "Q" }],
      ],
      roundScores: [10, 5],
      declaredMarriages: [],
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
      wonTricks: [[], []],
      roundScores: [0, 0],
      declaredMarriages: [],
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
      wonTricks: [[], []],
      roundScores: [0, 0],
      declaredMarriages: [],
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
});
