export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = "9" | "10" | "J" | "Q" | "K" | "A";

export type Card = {
  suit: Suit;
  rank: Rank;
};

export const CARD_POINTS: Record<Rank, number> = {
  A: 11,
  "10": 10,
  K: 4,
  Q: 3,
  J: 2,
  "9": 0,
};

export const RANK_ORDER: Rank[] = ["9", "J", "Q", "K", "10", "A"];

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = ["9", "10", "J", "Q", "K", "A"];

export function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }

  return deck;
}
