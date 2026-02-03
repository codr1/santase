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
- **Events**: `connected` (sent to all when guest first joins)
- **Cleanup**: Room deleted if host disconnects before guest ever joins

## Templates

HTML rendering with HTMX integration.

- **Layout**: Common HTML shell with HTMX + SSE extension scripts
- **Pages**: Home, Join, Lobby
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

**Functions**:
- `createDeck()`: Returns ordered 24-card deck
- `shuffleDeck(cards)`: Returns new array with cryptographically random ordering (Fisher-Yates with `crypto.getRandomValues`)

### Game State

```typescript
type GameState = {
  playerHands: [Card[], Card[]];
  stock: Card[];
  trumpCard: Card;
  trumpSuit: Suit;
  wonTricks: [Card[], Card[]];
  roundScores: [number, number];
};
```

**Functions**:
- `dealInitialHands(deck)`: Deals 6 cards per player (3, then trump, then 3 more), returns initial GameState with 11 cards in stock
- `getStockCount(state)`: Returns number of cards remaining in stock

