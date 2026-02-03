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

export const MARRIAGE_POINTS = 20;
export const TRUMP_MARRIAGE_POINTS = 40;

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

export function getMarriagePoints(suit: Suit, trumpSuit: Suit): number {
  return suit === trumpSuit ? TRUMP_MARRIAGE_POINTS : MARRIAGE_POINTS;
}

/**
 * Compare two cards by rank only; callers should ensure suits are the same.
 * Returns -1 if card1 wins, 1 if card2 wins, and 0 for equal ranks.
 */
export function compareCards(card1: Card, card2: Card): number {
  const rankIndex1 = RANK_ORDER.indexOf(card1.rank);
  const rankIndex2 = RANK_ORDER.indexOf(card2.rank);

  if (rankIndex1 === rankIndex2) {
    return 0;
  }

  return rankIndex1 > rankIndex2 ? -1 : 1;
}

/**
 * Compare two cards within a trick based on led and trump suits.
 * In normal gameplay, ledSuit should equal card1.suit (the first card led).
 * If ledSuit does not match either card (invalid state), the function falls
 * back to the logic below and ultimately returns card1 as the winner.
 * Returns 0 if card1 wins, 1 if card2 wins.
 */
export function compareTrick(card1: Card, card2: Card, ledSuit: Suit, trumpSuit: Suit): number {
  const card1IsTrump = card1.suit === trumpSuit;
  const card2IsTrump = card2.suit === trumpSuit;

  if (card1IsTrump !== card2IsTrump) {
    return card1IsTrump ? 0 : 1;
  }

  if (card1.suit === card2.suit) {
    const rankResult = compareCards(card1, card2);
    return rankResult === 1 ? 1 : 0;
  }

  const card1IsLed = card1.suit === ledSuit;
  const card2IsLed = card2.suit === ledSuit;

  if (card1IsLed !== card2IsLed) {
    return card1IsLed ? 0 : 1;
  }

  return 0;
}
