import {
  CARD_POINTS,
  DECLARE_THRESHOLD,
  SUITS,
  compareCards,
  compareTrick,
  getMarriagePoints,
  type Card,
  type Suit,
} from "./cards";

const INITIAL_DEAL_SIZE = 3;
const HAND_SIZE = 6;
const VALAT_OPPONENT_SCORE = 0;
const SCHNEIDER_THRESHOLD = 33;
const VALAT_GAME_POINTS = 3;
const SCHNEIDER_GAME_POINTS = 2;
const STANDARD_GAME_POINTS = 1;

export type GameState = {
  playerHands: [Card[], Card[]];
  stock: Card[];
  trumpCard: Card | null;
  trumpSuit: Suit;
  isClosed: boolean;
  wonTricks: [Card[], Card[]];
  roundScores: [number, number];
  declaredMarriages: Suit[];
};

export type RoundResult = {
  winner: 0 | 1;
  gamePoints: 1 | 2 | 3;
  /**
   * Round end condition:
   * - declared_66: player declares 66 and has at least 66 points.
   * - false_declaration: player declares 66 but has fewer than 66 points.
   * - exhausted: stock and hands are empty after the final trick.
   * - closed_failed: player closed the stock but failed to reach 66.
   */
  reason: "declared_66" | "false_declaration" | "exhausted" | "closed_failed";
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
    isClosed: false,
    wonTricks: [[], []],
    roundScores: [0, 0],
    declaredMarriages: [],
  };
}

export function getStockCount(state: GameState): number {
  return state.stock.length;
}

export function isDeckClosedOrExhausted(state: GameState): boolean {
  return state.isClosed || state.stock.length === 0;
export function canDeclare66(state: GameState, playerIndex: 0 | 1): boolean {
  return state.roundScores[playerIndex] >= DECLARE_THRESHOLD;
}

export function declare66(state: GameState, playerIndex: 0 | 1): RoundResult {
  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const playerScore = state.roundScores[playerIndex];

  if (playerScore < DECLARE_THRESHOLD) {
    return {
      winner: opponentIndex,
      gamePoints: VALAT_GAME_POINTS,
      reason: "false_declaration",
    };
  }

  return {
    winner: playerIndex,
    gamePoints: calculateGamePoints(state.roundScores[opponentIndex]),
    reason: "declared_66",
  };
}

export function calculateGamePoints(opponentScore: number): 1 | 2 | 3 {
  if (opponentScore === VALAT_OPPONENT_SCORE) {
    return VALAT_GAME_POINTS;
  }

  if (opponentScore < SCHNEIDER_THRESHOLD) {
    return SCHNEIDER_GAME_POINTS;
  }

  return STANDARD_GAME_POINTS;
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

export function canDeclareMarriage(
  state: GameState,
  playerIndex: 0 | 1,
  suit: Suit,
): boolean {
  if (state.declaredMarriages.includes(suit)) {
    return false;
  }

  return hasPotentialMarriage(state.playerHands[playerIndex], suit);
}

export function findDeclareableMarriages(
  state: GameState,
  playerIndex: 0 | 1,
): Suit[] {
  return SUITS.filter((suit) => canDeclareMarriage(state, playerIndex, suit));
}

export function declareMarriage(
  state: GameState,
  playerIndex: 0 | 1,
  suit: Suit,
): GameState {
  if (!canDeclareMarriage(state, playerIndex, suit)) {
    throw new Error("Player cannot declare marriage for this suit.");
  }

  const updatedScores: [number, number] = [...state.roundScores];
  updatedScores[playerIndex] += getMarriagePoints(suit, state.trumpSuit);

  return {
    ...state,
    declaredMarriages: [...state.declaredMarriages, suit],
    roundScores: updatedScores,
  };
}

function removeCardAt(hand: Card[], index: number): Card[] {
  return [...hand.slice(0, index), ...hand.slice(index + 1)];
}

export function playTrick(
  state: GameState,
  leaderIndex: number,
  leaderCard: Card,
  followerCard: Card,
): GameState {
  const followerIndex = leaderIndex === 0 ? 1 : 0;
  const leaderHand = state.playerHands[leaderIndex];
  const followerHand = state.playerHands[followerIndex];

  const leaderCardIndex = leaderHand.findIndex(
    (card) => card.suit === leaderCard.suit && card.rank === leaderCard.rank,
  );
  if (leaderCardIndex < 0) {
    throw new Error("Leader card not found in hand.");
  }

  const followerCardIndex = followerHand.findIndex(
    (card) => card.suit === followerCard.suit && card.rank === followerCard.rank,
  );
  if (followerCardIndex < 0) {
    throw new Error("Follower card not found in hand.");
  }

  if (isDeckClosedOrExhausted(state)) {
    const validFollowerCards = getValidFollowerCards(
      followerHand,
      leaderCard,
      state.trumpSuit,
      true,
    );
    const isValidFollowerCard = validFollowerCards.some(
      (card) => card.suit === followerCard.suit && card.rank === followerCard.rank,
    );
    if (!isValidFollowerCard) {
      throw new Error(
        "Follower card must follow suit or trump when the deck is closed or exhausted.",
      );
    }
  }

  const nextLeaderHand = removeCardAt(leaderHand, leaderCardIndex);
  const nextFollowerHand = removeCardAt(followerHand, followerCardIndex);
  const nextHands: [Card[], Card[]] =
    leaderIndex === 0 ? [nextLeaderHand, nextFollowerHand] : [nextFollowerHand, nextLeaderHand];

  const winnerOffset = compareTrick(leaderCard, followerCard, leaderCard.suit, state.trumpSuit);
  const winnerIndex = winnerOffset === 0 ? leaderIndex : followerIndex;
  const trickPoints = CARD_POINTS[leaderCard.rank] + CARD_POINTS[followerCard.rank];

  const nextWonTricks: [Card[], Card[]] = [
    [...state.wonTricks[0]],
    [...state.wonTricks[1]],
  ];
  nextWonTricks[winnerIndex] = [
    ...nextWonTricks[winnerIndex],
    leaderCard,
    followerCard,
  ];

  const nextRoundScores: [number, number] = [
    state.roundScores[0],
    state.roundScores[1],
  ];
  nextRoundScores[winnerIndex] += trickPoints;

  return {
    ...state,
    playerHands: nextHands,
    wonTricks: nextWonTricks,
    roundScores: nextRoundScores,
  };
}

export function drawFromStock(state: GameState, winnerIndex: 0 | 1): GameState {
  if (state.stock.length === 0) {
    return state;
  }

  const loserIndex = winnerIndex === 0 ? 1 : 0;
  const nextHands: [Card[], Card[]] = [
    [...state.playerHands[0]],
    [...state.playerHands[1]],
  ];

  if (state.stock.length === 1) {
    const winnerCard = state.stock[0];
    if (!winnerCard) {
      throw new Error("Stock does not have enough cards to draw.");
    }

    if (!state.trumpCard) {
      throw new Error("Trump card is not available for final draw.");
    }

    nextHands[winnerIndex] = [...nextHands[winnerIndex], winnerCard];
    nextHands[loserIndex] = [...nextHands[loserIndex], state.trumpCard];

    return {
      ...state,
      stock: [],
      trumpCard: null,
      playerHands: nextHands,
    };
  }

  const nextStock = [...state.stock];
  const winnerCard = nextStock.shift();
  const loserCard = nextStock.shift();

  if (!winnerCard || !loserCard) {
    throw new Error("Stock does not have enough cards to draw.");
  }

  nextHands[winnerIndex] = [...nextHands[winnerIndex], winnerCard];
  nextHands[loserIndex] = [...nextHands[loserIndex], loserCard];

  return {
    ...state,
    stock: nextStock,
    playerHands: nextHands,
  };
}

/**
 * Returns playable follower cards under Santase "must-head" rules
 * when the deck is closed or exhausted.
 */
export function getValidFollowerCards(
  hand: Card[],
  ledCard: Card,
  trumpSuit: Suit,
  deckClosedOrExhausted: boolean,
): Card[] {
  if (!deckClosedOrExhausted) {
    return hand;
  }

  const ledSuitCards = hand.filter((card) => card.suit === ledCard.suit);
  if (ledSuitCards.length > 0) {
    const winningLedSuitCards = ledSuitCards.filter(
      (card) => compareCards(card, ledCard) === -1,
    );
    return winningLedSuitCards.length > 0 ? winningLedSuitCards : ledSuitCards;
  }

  const trumpCards = hand.filter((card) => card.suit === trumpSuit);
  if (trumpCards.length > 0) {
    return trumpCards;
  }

  return hand;
}
