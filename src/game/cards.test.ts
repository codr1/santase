import { describe, expect, test } from "bun:test";
import {
  CARD_POINTS,
  MARRIAGE_POINTS,
  RANK_ORDER,
  TRUMP_MARRIAGE_POINTS,
  createDeck,
  getMarriagePoints,
  shuffleDeck,
} from "./cards";
import { CARD_POINTS, RANK_ORDER, type Suit, compareCards, createDeck, shuffleDeck } from "./cards";

describe("createDeck", () => {
  test("creates a 24-card deck", () => {
    const deck = createDeck();

    expect(deck).toHaveLength(24);
  });

  test("includes 6 cards per suit", () => {
    const deck = createDeck();
    const counts = new Map<string, number>();

    for (const card of deck) {
      counts.set(card.suit, (counts.get(card.suit) ?? 0) + 1);
    }

    expect(counts.get("hearts")).toBe(6);
    expect(counts.get("diamonds")).toBe(6);
    expect(counts.get("clubs")).toBe(6);
    expect(counts.get("spades")).toBe(6);
  });

  test("includes 24 unique cards", () => {
    const deck = createDeck();
    const unique = new Set(deck.map((card) => `${card.suit}:${card.rank}`));

    expect(unique.size).toBe(24);
  });

  test("uses the correct point values", () => {
    expect(CARD_POINTS.A).toBe(11);
    expect(CARD_POINTS["10"]).toBe(10);
    expect(CARD_POINTS.K).toBe(4);
    expect(CARD_POINTS.Q).toBe(3);
    expect(CARD_POINTS.J).toBe(2);
    expect(CARD_POINTS["9"]).toBe(0);
  });
});

describe("RANK_ORDER", () => {
  test("matches the trick comparison order", () => {
    expect(RANK_ORDER).toEqual(["9", "J", "Q", "K", "10", "A"]);
  });
});

describe("shuffleDeck", () => {
  const SHUFFLE_ATTEMPTS = 10;

  test("returns a 24-card deck with the same cards", () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    const originalSet = new Set(deck.map((card) => `${card.suit}:${card.rank}`));
    const shuffledSet = new Set(shuffled.map((card) => `${card.suit}:${card.rank}`));

    expect(shuffled).toHaveLength(24);
    expect(shuffledSet.size).toBe(24);

    for (const card of originalSet) {
      expect(shuffledSet.has(card)).toBe(true);
    }
  });

  test("produces different orderings across multiple calls", () => {
    const deck = createDeck();
    const orderings = new Set<string>();

    for (let attempt = 0; attempt < SHUFFLE_ATTEMPTS; attempt += 1) {
      orderings.add(
        shuffleDeck(deck)
          .map((card) => `${card.suit}:${card.rank}`)
          .join(","),
      );
    }

    expect(orderings.size).toBeGreaterThan(1);
  });
});

describe("getMarriagePoints", () => {
  const cases = [
    { suit: "hearts", trumpSuit: "hearts", expected: TRUMP_MARRIAGE_POINTS },
    { suit: "clubs", trumpSuit: "spades", expected: MARRIAGE_POINTS },
  ] as const;

  test.each(cases)("returns $expected for $suit with trump $trumpSuit", ({ suit, trumpSuit, expected }) => {
    expect(getMarriagePoints(suit, trumpSuit)).toBe(expected);
describe("compareCards", () => {
  const SUIT: Suit = "spades";

  test("matches the rank order for all comparisons", () => {
    for (let leftIndex = 0; leftIndex < RANK_ORDER.length; leftIndex += 1) {
      for (let rightIndex = 0; rightIndex < RANK_ORDER.length; rightIndex += 1) {
        const left = { suit: SUIT, rank: RANK_ORDER[leftIndex] };
        const right = { suit: SUIT, rank: RANK_ORDER[rightIndex] };
        const result = compareCards(left, right);

        if (leftIndex === rightIndex) {
          expect(result).toBe(0);
        } else if (leftIndex > rightIndex) {
          expect(result).toBe(-1);
        } else {
          expect(result).toBe(1);
        }
      }
    }
  });

  test("covers the example rank matchups", () => {
    expect(compareCards({ suit: SUIT, rank: "A" }, { suit: SUIT, rank: "10" })).toBe(-1);
    expect(compareCards({ suit: SUIT, rank: "10" }, { suit: SUIT, rank: "K" })).toBe(-1);
    expect(compareCards({ suit: SUIT, rank: "9" }, { suit: SUIT, rank: "J" })).toBe(1);
  });
});
