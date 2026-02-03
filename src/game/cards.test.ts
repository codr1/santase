import { describe, expect, test } from "bun:test";
import { CARD_POINTS, RANK_ORDER, createDeck, shuffleDeck } from "./cards";

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
