# Specification

<!--
SPEC.md documents implemented behavior.
It's auto-updated when workstreams merge.

You generally don't edit this manually - it grows as features ship.
Think of it as living documentation generated from your stories.
-->

## Server

Bun-based HTTP server. Port configurable via `BUN_PORT` environment variable, defaults to 3000.

### Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Home page with Create/Join room buttons |
| GET | `/join` | Join room form |
| POST | `/rooms` | Create new room, redirects to lobby |
| GET | `/rooms?code=X` | Look up room by code, redirects to room |
| GET | `/rooms/:code` | Guest lobby view |
| GET | `/rooms/:code/lobby` | Host lobby view |
| GET | `/rooms/:code/game` | Game page view |
| POST | `/rooms/:code/start` | Start game (host only, requires hostToken) |
| GET | `/sse/:code` | SSE connection endpoint |

## Rooms

In-memory room storage with automatic cleanup.

- **Code format**: 4-6 uppercase alphanumeric characters (excludes ambiguous chars like O/I)
- **Code normalization**: Trimmed, uppercased, `O` converted to `0`
- **Host token**: UUID assigned at creation, used to authenticate host SSE connections
- **Inactivity timeout**: 10 minutes
- **Cleanup interval**: 10 minutes

### Room State

```typescript
type Room = {
  code: string;
  hostToken: string;
  hostConnected: boolean;
  guestConnected: boolean;
  guestEverJoined: boolean;
  lastActivity: number;
  createdAt: number;
};
```

## SSE

Server-Sent Events for real-time communication.

- **Endpoint**: `/sse/:code?hostToken=X` (token optional, identifies host)
- **Heartbeat**: Every 25 seconds (comment ping)
- **Cleanup**: Room deleted if host disconnects before guest ever joins

### Events

| Event | Target | Data |
|-------|--------|------|
| `connected` | all | `"guest"` when guest first joins |
| `status` | all | Lobby status HTML (`<span>` with connection state) |
| `start-game` | host | Start button HTML (empty when guest disconnected) |
| `game-start` | all | Game URL path for redirect |

### Functions

- `startGame(roomCode)`: Broadcasts `game-start` event with game URL to all clients

## Templates

HTML rendering with HTMX integration.

- **Layout**: Common HTML shell with HTMX + SSE extension scripts
- **Pages**: Home, Join, Lobby, Game
- **XSS protection**: All dynamic content escaped via `escapeHtml()`

## Game

Card deck and game state management for Santase (66).

### Cards

24-card deck using 4 suits × 6 ranks.

```typescript
type Suit = "hearts" | "diamonds" | "clubs" | "spades";
type Rank = "9" | "10" | "J" | "Q" | "K" | "A";
type Card = { suit: Suit; rank: Rank };
```

**Point values**: A=11, 10=10, K=4, Q=3, J=2, 9=0

**Rank order** (for trick comparison): 9, J, Q, K, 10, A

**Marriage points**: Regular=20, Trump=40

**Functions**:
- `createDeck()`: Returns ordered 24-card deck
- `shuffleDeck(cards)`: Returns new array with cryptographically random ordering (Fisher-Yates with `crypto.getRandomValues`)
- `getMarriagePoints(suit, trumpSuit)`: Returns 40 for trump marriage, 20 otherwise
- `compareCards(card1, card2)`: Compares two cards by rank only; returns -1 if card1 wins, 1 if card2 wins, 0 for equal
- `compareTrick(card1, card2, ledSuit, trumpSuit)`: Compares two cards in a trick; trump beats non-trump, led suit beats off-suit; returns 0 if card1 wins, 1 if card2 wins

### Game State

```typescript
type GameState = {
  playerHands: [Card[], Card[]];
  stock: Card[];
  trumpCard: Card | null;
  trumpSuit: Suit;
  isClosed: boolean;
  wonTricks: [Card[], Card[]];
  roundScores: [number, number];
  declaredMarriages: Suit[];
};
```

**Functions**:
- `dealInitialHands(deck)`: Deals 6 cards per player (3, then trump, then 3 more), returns initial GameState with 11 cards in stock
- `getStockCount(state)`: Returns number of cards remaining in stock
- `hasPotentialMarriage(hand, suit)`: Returns true if hand contains K and Q of suit
- `canDeclareMarriage(state, playerIndex, suit)`: Returns true if player can declare marriage (has K+Q and suit not already declared)
- `findDeclareableMarriages(state, playerIndex)`: Returns array of suits player can declare
- `declareMarriage(state, playerIndex, suit)`: Returns new GameState with marriage declared and points added
- `isDeckClosedOrExhausted(state)`: Returns true if deck is closed or stock is empty
- `playTrick(state, leaderIndex, leaderCard, followerCard)`: Resolves a trick, removes cards from hands, awards winner the cards and points; enforces follow-suit rules when deck is closed/exhausted; returns new GameState
- `drawFromStock(state, winnerIndex)`: After a trick, winner draws top stock card, loser draws next (or trump card on final draw); sets trumpCard to null when exhausted; no-op if stock empty
- `getValidFollowerCards(hand, ledCard, trumpSuit, deckClosedOrExhausted)`: Returns valid cards follower can play; when deck is closed/exhausted, must head in led suit if possible, else play any led suit card, else play trump, else any card
