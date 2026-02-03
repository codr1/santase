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

export const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
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

function randomIntInclusive(min: number, max: number): number {
  const range = max - min + 1;
  const values = crypto.getRandomValues(new Uint32Array(1));
  return min + (values[0] % range);
}

export function shuffleDeck(cards: Card[]): Card[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIntInclusive(0, index);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}
