import type { Card, Suit } from "./cards";

const INITIAL_DEAL_SIZE = 3;
const HAND_SIZE = 6;

export type GameState = {
  playerHands: [Card[], Card[]];
  stock: Card[];
  trumpCard: Card;
  trumpSuit: Suit;
  wonTricks: [Card[], Card[]];
  roundScores: [number, number];
  declaredMarriages: Suit[];
};

export function dealInitialHands(deck: Card[]): GameState {
  if (deck.length < HAND_SIZE * 2 + 1) {
    throw new Error("Deck does not have enough cards to deal a new round.");
  }

  let cursor = 0;

  const playerOneFirst = deck.slice(cursor, cursor + INITIAL_DEAL_SIZE);
  cursor += INITIAL_DEAL_SIZE;
  const playerTwoFirst = deck.slice(cursor, cursor + INITIAL_DEAL_SIZE);
  cursor += INITIAL_DEAL_SIZE;

  const trumpCard = deck[cursor];
  cursor += 1;

  const playerOneSecond = deck.slice(cursor, cursor + INITIAL_DEAL_SIZE);
  cursor += INITIAL_DEAL_SIZE;
  const playerTwoSecond = deck.slice(cursor, cursor + INITIAL_DEAL_SIZE);
  cursor += INITIAL_DEAL_SIZE;

  return {
    playerHands: [
      [...playerOneFirst, ...playerOneSecond],
      [...playerTwoFirst, ...playerTwoSecond],
    ],
    stock: deck.slice(cursor),
    trumpCard,
    trumpSuit: trumpCard.suit,
    wonTricks: [[], []],
    roundScores: [0, 0],
    declaredMarriages: [],
  };
}

export function getStockCount(state: GameState): number {
  return state.stock.length;
}

export function hasPotentialMarriage(hand: Card[], suit: Suit): boolean {
  let hasKing = false;
  let hasQueen = false;

  for (const card of hand) {
    if (card.suit !== suit) {
      continue;
    }

    if (card.rank === "K") {
      hasKing = true;
    } else if (card.rank === "Q") {
      hasQueen = true;
    }

    if (hasKing && hasQueen) {
      return true;
    }
  }

  return false;
}
