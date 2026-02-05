import {
  CARD_POINTS,
  DECLARE_THRESHOLD,
  SUITS,
  compareCards,
  compareTrick,
  createDeck,
  getMarriagePoints,
  shuffleDeck,
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

export type GameState = {
  playerHands: [Card[], Card[]];
  stock: Card[];
  trumpCard: Card | null;
  trumpSuit: Suit;
  isClosed: boolean;
  leader: 0 | 1;
  currentTrick: { leaderIndex: 0 | 1; leaderCard: Card } | null;
  lastCompletedTrick: { leaderIndex: 0 | 1; leaderCard: Card; followerCard: Card } | null;
  closedBy: 0 | 1 | null;
  wonTricks: [Card[], Card[]];
  roundScores: [number, number];
  declaredMarriages: Suit[];
  roundResult: RoundResult | null;
};

export type MatchState = {
  game: GameState;
  matchScores: [number, number];
  dealerIndex: 0 | 1;
  leaderIndex: 0 | 1;
};

function randomDealerIndex(): 0 | 1 {
  const values = crypto.getRandomValues(new Uint32Array(1));
  return (values[0] % 2) as 0 | 1;
}

export function startMatch(): MatchState {
  const dealerIndex = randomDealerIndex();
  const leaderIndex = dealerIndex === 0 ? 1 : 0;
  const deck = shuffleDeck(createDeck());

  return {
    game: dealInitialHands(deck, dealerIndex),
    matchScores: [0, 0],
    dealerIndex,
    leaderIndex,
  };
}

export function startNewRound(
  matchState: MatchState,
  roundWinnerIndex: 0 | 1,
): MatchState {
  const roundResult = matchState.game.roundResult;
  if (!roundResult) {
    throw new Error("Round has not ended.");
  }
  if (roundWinnerIndex !== roundResult.winner) {
    throw new Error("Round winner does not match the round result.");
  }

  const nextMatchScores: [number, number] = [
    matchState.matchScores[0],
    matchState.matchScores[1],
  ];
  nextMatchScores[roundWinnerIndex] += roundResult.gamePoints;

  const dealerIndex = roundWinnerIndex === 0 ? 1 : 0;
  const leaderIndex = roundWinnerIndex;
  const deck = shuffleDeck(createDeck());

  return {
    game: dealInitialHands(deck, dealerIndex),
    matchScores: nextMatchScores,
    dealerIndex,
    leaderIndex,
  };
}

export function initializeMatch(): MatchState {
  return startMatch();
}

export function applyRoundResult(
  matchState: MatchState,
  winnerIndex: 0 | 1,
  points: 1 | 2 | 3,
): MatchState {
  const nextScores: [number, number] = [...matchState.matchScores];
  nextScores[winnerIndex] += points;
  return {
    ...matchState,
    matchScores: nextScores,
  };
}

export function isMatchOver(matchState: MatchState): boolean {
  return matchState.matchScores[0] >= 11 || matchState.matchScores[1] >= 11;
}

export function getMatchWinner(matchState: MatchState): 0 | 1 | null {
  const [playerOneScore, playerTwoScore] = matchState.matchScores;

  if (
    playerOneScore >= 11 &&
    playerTwoScore >= 11 &&
    playerOneScore === playerTwoScore
  ) {
    throw new Error("Match state is invalid: tied score at or above 11.");
  }

  if (playerOneScore >= 11 && playerOneScore > playerTwoScore) {
    return 0;
  }

  if (playerTwoScore >= 11 && playerTwoScore > playerOneScore) {
    return 1;
  }

  return null;
}

export function dealInitialHands(deck: Card[], dealerIndex: 0 | 1 = 0): GameState {
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

  const leader: 0 | 1 = dealerIndex === 0 ? 1 : 0;

  return {
    playerHands: [
      [...playerOneFirst, ...playerOneSecond],
      [...playerTwoFirst, ...playerTwoSecond],
    ],
    stock: deck.slice(cursor),
    trumpCard,
    trumpSuit: trumpCard.suit,
    isClosed: false,
    leader,
    currentTrick: null,
    lastCompletedTrick: null,
    closedBy: null,
    wonTricks: [[], []],
    roundScores: [0, 0],
    declaredMarriages: [],
    roundResult: null,
  };
}

export function getStockCount(state: GameState): number {
  return state.stock.length;
}

export function isDeckClosedOrExhausted(state: GameState): boolean {
  return state.isClosed || state.stock.length === 0;
}

export function canCloseDeck(state: GameState): boolean {
  if (state.roundResult) {
    return false;
  }
  return state.stock.length >= 3 && !state.isClosed && state.trumpCard !== null;
}

export function closeDeck(state: GameState, playerIndex: 0 | 1): GameState {
  if (state.roundResult) {
    throw new Error("Round already ended.");
  }

  if (state.stock.length < 3) {
    throw new Error("Stock must have at least 3 cards to close the deck.");
  }

  if (state.isClosed) {
    throw new Error("Deck is already closed.");
  }

  if (state.trumpCard === null) {
    throw new Error("Trump card is not available to close the deck.");
  }

  return {
    ...state,
    isClosed: true,
    closedBy: playerIndex,
  };
}

export function canDeclare66(state: GameState, playerIndex: 0 | 1): boolean {
  if (state.roundResult) {
    return false;
  }
  return state.roundScores[playerIndex] >= DECLARE_THRESHOLD;
}

export function declare66(state: GameState, playerIndex: 0 | 1): GameState {
  if (state.roundResult) {
    throw new Error("Round already ended.");
  }

  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const playerScore = state.roundScores[playerIndex];

  if (playerScore < DECLARE_THRESHOLD) {
    const result: RoundResult = {
      winner: opponentIndex,
      gamePoints: VALAT_GAME_POINTS,
      reason: "false_declaration",
    };
    return {
      ...state,
      roundResult: result,
    };
  }

  const result: RoundResult = {
    winner: playerIndex,
    gamePoints: calculateGamePoints(state.roundScores[opponentIndex]),
    reason: "declared_66",
  };
  return {
    ...state,
    roundResult: result,
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

export function calculateWinPoints(
  roundState: GameState,
  closerIndex?: 0 | 1,
): 1 | 2 | 3 {
  if (!roundState.roundResult) {
    throw new Error("Round result is not available.");
  }

  const loserIndex = roundState.roundResult.winner === 0 ? 1 : 0;

  if (closerIndex !== undefined && closerIndex === loserIndex) {
    return VALAT_GAME_POINTS;
  }

  return calculateGamePoints(roundState.roundScores[loserIndex]);
}

export function canExchangeTrump9(state: GameState, playerIndex: 0 | 1): boolean {
  if (state.currentTrick) {
    return false;
  }

  if (state.leader !== playerIndex) {
    return false;
  }

  if (!state.trumpCard) {
    return false;
  }

  if (state.stock.length <= 2) {
    return false;
  }

  return state.playerHands[playerIndex].some(
    (card) => card.rank === "9" && card.suit === state.trumpSuit,
  );
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

export function exchangeTrump9(state: GameState, playerIndex: 0 | 1): GameState {
  if (!canExchangeTrump9(state, playerIndex)) {
    throw new Error("Player cannot exchange the trump 9.");
  }

  if (!state.trumpCard) {
    throw new Error("Trump card is not available for exchange.");
  }

  const playerHand = state.playerHands[playerIndex];
  const trump9Index = playerHand.findIndex(
    (card) => card.rank === "9" && card.suit === state.trumpSuit,
  );

  if (trump9Index < 0) {
    throw new Error("Trump 9 not found in hand.");
  }

  const trump9Card = playerHand[trump9Index];
  const nextHand = [...removeCardAt(playerHand, trump9Index), state.trumpCard];
  const nextHands: [Card[], Card[]] =
    playerIndex === 0 ? [nextHand, state.playerHands[1]] : [state.playerHands[0], nextHand];

  return {
    ...state,
    playerHands: nextHands,
    trumpCard: trump9Card,
  };
}

export function playTrick(
  state: GameState,
  leaderIndex: 0 | 1,
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
  const winnerIndex: 0 | 1 = winnerOffset === 0 ? leaderIndex : followerIndex;
  const trickPoints = CARD_POINTS[leaderCard.rank] + CARD_POINTS[followerCard.rank];
  const nextLeader = winnerIndex;

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
    leader: nextLeader,
    wonTricks: nextWonTricks,
    roundScores: nextRoundScores,
    currentTrick: null,
    lastCompletedTrick: { leaderIndex, leaderCard, followerCard },
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
