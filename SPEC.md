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
| POST | `/rooms/:code/play` | Play a card (JSON body: `{card, marriageSuit?}`) |
| POST | `/rooms/:code/exchange-trump` | Exchange trump 9 for the trump card |
| GET | `/sse/:code` | SSE connection endpoint |
| GET | `/public/*` | Static file serving (path-traversal protected) |

## Rooms

In-memory room storage with automatic cleanup.

- **Code format**: 4-6 uppercase alphanumeric characters (excludes ambiguous chars like O/I)
- **Code normalization**: Trimmed, uppercased, `O` converted to `0`
- **Host token**: UUID assigned at creation, used to authenticate host SSE connections
- **Inactivity timeout**: 10 minutes
- **Cleanup interval**: 10 minutes
- **Expired room retention**: 1 hour (for better error messages)

### Room State

```typescript
type Room = {
  code: string;
  hostToken: string;
  hostPlayerIndex: 0 | 1;
  hostConnected: boolean;
  guestConnected: boolean;
  guestEverJoined: boolean;
  lastActivity: number;
  createdAt: number;
  matchState: MatchState;
};

type RoomDeleteReason = "expired" | "host-left" | "manual";

type RoomLookupResult =
  | { status: "active"; room: Room }
  | { status: "expired"; expiredAt: number; reason: RoomDeleteReason }
  | { status: "missing" };
```

### Room Lookup Errors

| Status | HTTP Code | Message |
|--------|-----------|---------|
| active | 200 | - |
| expired | 410 Gone | "Room expired. Start a new room." |
| missing | 404 Not Found | "Room not found. Double-check the code." |

SSE endpoint returns specific message for `host-left`: "Room closed because the host left."

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
| `game-start` | all | Game URL path for redirect |
| `game-state` | all | JSON-serialized `MatchState` for real-time updates |

## Play Endpoint

`POST /rooms/:code/play` handles card plays during a game.

### Request

```typescript
{
  card: { suit: Suit; rank: Rank };
  marriageSuit?: Suit;  // optional, declares marriage when leading
}
```

### Player Resolution

Player index determined by `hostToken` query param or `hostToken-{code}` cookie (same as game page viewer).

### Turn Logic

- **Leading**: When `currentTrick` is null, the `leader` plays first
- **Following**: When `currentTrick` exists, the opponent of `leaderIndex` plays

### Responses

| Status | Condition |
|--------|-----------|
| 200 | Card played successfully |
| 400 | Invalid payload, card not in hand, invalid follower card, invalid marriage |
| 409 | Not your turn, round/match already ended |

### Behavior

- Validates card is in player's hand
- For leader: sets `currentTrick` with played card; processes marriage if declared
- For follower: enforces follow-suit rules when deck is closed/exhausted; resolves trick winner, awards points, triggers draw from stock
- Ends round when hands exhausted (awards game points based on scores or closer penalty)
- Broadcasts `game-state` to all connected clients

## Exchange Trump Endpoint

`POST /rooms/:code/exchange-trump` allows the leader to swap the trump 9 in their hand for the face-up trump card.

### Player Resolution

Same as play endpoint (hostToken query param or cookie).

### Responses

| Status | Condition |
|--------|-----------|
| 200 | Exchange successful |
| 409 | Not the leader, exchange not allowed (missing trump 9, stock too small, trick in progress), round/match already ended |

### Behavior

- Validates player is the leader and `canExchangeTrump9` passes
- Swaps trump 9 in hand with the trump card
- Broadcasts `game-state` to all connected clients

## Templates

HTML rendering with HTMX integration and Tailwind CSS styling.

- **Layout**: Common HTML shell with HTMX + SSE extension scripts, Tailwind CSS (CDN), Inter font, GSAP animation library
- **Pages**: Home, Join, Lobby, Game
- **XSS protection**: All dynamic content escaped via `escapeHtml()`
- **Styles**: Shared button classes in `src/templates/styles.ts` (`buttonBaseClasses`)

### Card Rendering

SVG sprite-based card images served locally from `/public/svg-cards.svg` (avoids cross-origin issues with CDN).

- **Face cards**: `getCardImageUrl(card)` returns sprite URL for any Card
- **Card backs**: `getCardBackUrl()` returns sprite URL for card back
- **Format**: URLs are SVG fragment identifiers for use with `<svg><use href="...">` pattern

### Game Page

Renders the interactive game board with viewer-specific perspective.

- **Viewer resolution**: Host identified via `hostToken` query param or `hostToken-{code}` cookie; determines which hand is shown face-up
- **Host cookie**: Set on lobby page load with `Path=/rooms/{code}; SameSite=Lax; HttpOnly`
- **Layout sections**: Opponent hand (face-down), scores panel, current trick area, trump/stock display, player hand (face-up fan)
- **Card fan**: Player cards arranged in arc with GSAP animation on page load
- **Waiting state**: When not player's turn, cards shift down and desaturate
- **SSE connection**: Subscribes to `game-state` events for real-time updates
- **Current trick display**: Shows leader and follower cards in the trick area; cards animate from source hand to trick slot using GSAP; displays status text ("Waiting for response", "Last trick complete", or "No cards played yet")
- **Trick resolution animation**: When a trick completes, cards pause briefly (1s) then animate to the winner's won pile with scale-down and fade-out
- **Stock pile stacking**: Stock cards render as layered card backs (1 layer per 4 cards) with vertical offset for depth effect
- **Won trick/card counters**: Numeric displays for each player's won tricks and won card counts, updated in real-time
- **Trump 9 exchange button**: Shown when the player can exchange (is leader, holds trump 9, stock has 3+ cards, no trick in progress); sends POST to `/rooms/:code/exchange-trump`; optimistically updates hand and trump card
- **Real-time DOM updates**: Client-side JavaScript processes `game-state` events to update player hand, opponent hand count, trump card, stock pile, won pile displays, trick area, and won counters without full page reload; uses GSAP animations for card additions/removals
- **Click-to-play**: Player cards are clickable when it's the player's turn; clicking sends POST to `/rooms/:code/play`; automatically declares marriage when leading with K or Q of a declareable suit

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

**Declaration threshold**: 66 points

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
  leader: 0 | 1;
  currentTrick: { leaderIndex: 0 | 1; leaderCard: Card } | null;
  lastCompletedTrick: { leaderIndex: 0 | 1; leaderCard: Card; followerCard: Card } | null;
  closedBy: 0 | 1 | null;
  wonTricks: [Card[], Card[]];
  roundScores: [number, number];
  declaredMarriages: Suit[];
  roundResult: RoundResult | null;
};

type RoundResult = {
  winner: 0 | 1;
  gamePoints: 1 | 2 | 3;
  reason: "declared_66" | "false_declaration" | "exhausted" | "closed_failed";
};
```

**Functions**:
- `dealInitialHands(deck, dealerIndex)`: Deals 6 cards per player (3, then trump, then 3 more), returns initial GameState with 11 cards in stock; sets `leader` to dealer's opponent
- `getStockCount(state)`: Returns number of cards remaining in stock
- `canCloseDeck(state)`: Returns true when stock has 3+ cards, deck is not already closed, trump card exists, and round hasn't ended
- `closeDeck(state, playerIndex)`: Sets `isClosed` to true and `closedBy` to the closing player; throws when conditions not met
- `canDeclare66(state, playerIndex)`: Returns true if player has ≥66 points and round hasn't ended
- `declare66(state, playerIndex)`: Returns new GameState with roundResult set; awards declaring player if they have ≥66 points, otherwise opponent wins with 3 game points
- `calculateGamePoints(opponentScore)`: Returns game points based on opponent score: 3 if 0, 2 if 1-32, 1 if ≥33
- `calculateWinPoints(state, closerIndex?)`: Returns win points for the round; if closer loses, returns 3 (penalty); otherwise uses calculateGamePoints
- `canExchangeTrump9(state, playerIndex)`: Returns true when no trick is in progress, player is leader, stock has 3+ cards, trump card is available, and player holds trump 9
- `exchangeTrump9(state, playerIndex)`: Swaps trump 9 in hand with trump card; throws when exchange not allowed
- `hasPotentialMarriage(hand, suit)`: Returns true if hand contains K and Q of suit
- `canDeclareMarriage(state, playerIndex, suit)`: Returns true if player can declare marriage (has K+Q and suit not already declared)
- `findDeclareableMarriages(state, playerIndex)`: Returns array of suits player can declare
- `declareMarriage(state, playerIndex, suit)`: Returns new GameState with marriage declared and points added
- `isDeckClosedOrExhausted(state)`: Returns true if deck is closed or stock is empty
- `playTrick(state, leaderIndex, leaderCard, followerCard)`: Resolves a trick, removes cards from hands, awards winner the cards and points; sets `lastCompletedTrick` and clears `currentTrick`; enforces follow-suit rules when deck is closed/exhausted; returns new GameState
- `drawFromStock(state, winnerIndex)`: After a trick, winner draws top stock card, loser draws next (or trump card on final draw); sets trumpCard to null when exhausted; no-op if stock empty
- `getValidFollowerCards(hand, ledCard, trumpSuit, deckClosedOrExhausted)`: Returns valid cards follower can play; when deck is closed/exhausted, must head in led suit if possible, else play any led suit card, else play trump, else any card

### Match State

Tracks win points across multiple rounds. First player to reach 11 points wins the match.

```typescript
type MatchState = {
  game: GameState;
  matchScores: [number, number];
  dealerIndex: 0 | 1;
  leaderIndex: 0 | 1;
};
```

**Functions**:
- `startMatch()`: Creates a new match with shuffled deck, random dealer, and initial game state
- `startNewRound(matchState, roundWinnerIndex)`: Applies round result to match scores, rotates dealer to loser, sets leader to winner, and deals fresh hands; throws if round hasn't ended or winner doesn't match result
- `initializeMatch()`: Alias for `startMatch()`
- `applyRoundResult(matchState, winnerIndex, points)`: Returns new MatchState with winner's score incremented
- `isMatchOver(matchState)`: Returns true when either player has ≥11 points
- `getMatchWinner(matchState)`: Returns winning player index (0 or 1) or null if match not over; throws if tied at ≥11
