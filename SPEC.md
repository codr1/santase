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
| POST | `/rooms/:code/close-deck` | Close the deck (leader only) |
| POST | `/rooms/:code/declare-66` | Declare 66 points to win the round |
| POST | `/rooms/:code/ready` | Mark player as ready for next round |
| POST | `/rooms/:code/next-round` | Force-start next round (countdown fallback) |
| GET | `/rooms/:code/results` | Match results page |
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
  hostReady: boolean;
  guestReady: boolean;
  disconnectTimeouts: {
    host?: ReturnType<typeof setTimeout>;
    guest?: ReturnType<typeof setTimeout>;
  };
  forfeit: boolean;
  draw: boolean;
  lastActivity: number;
  lastTrickCompletedAt: number | null;
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

**Functions**:
- `forfeitMatch(room, winnerIndex)`: Sets the winner's match score to at least 11, marks `forfeit` as true, sets `draw` to false, and resets ready flags; returns false if match is already over

## SSE

Server-Sent Events for real-time communication.

- **Endpoint**: `/sse/:code?hostToken=X` (token optional, identifies host)
- **Heartbeat**: Every 25 seconds (comment ping)
- **Cleanup**: Room deleted if host disconnects before guest ever joins
- **Disconnect handling**: Each player gets an independent 30-second disconnect timeout. When a player disconnects after the game has started (guest has joined) and the match is not over, their timeout starts; reconnecting clears only that player's timeout. If one player's timeout fires while the other is still connected, the connected player wins via `forfeitMatch`. If both players are disconnected when a timeout fires, the match is declared a draw (`room.draw = true`); a subsequent timeout for the other role is a no-op after draw
- **Draw state**: When `room.draw` is true, SSE connections receive a single `game-state` event with `draw: true` and then close; the game page redirects to results
- **Status markup**: `<span>` includes `data-host-connected` and `data-guest-connected` attributes with empty content (client-side JS derives status text)

### Events

| Event | Target | Data |
|-------|--------|------|
| `connected` | all | `"guest"` when guest first joins |
| `status` | all | Lobby status HTML (`<span>` with connection state) |
| `game-start` | all | Game URL path for redirect |
| `game-state` | all | JSON-serialized `ViewerMatchState` with added `draw` boolean for real-time updates |
| `ready-state` | all | JSON `{hostReady, guestReady}` when a player marks ready |

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

- **Declare-66 grace period**: When the leader plays after a trick completes, a 2.6-second grace period is enforced (returns 409 "Please wait before playing") to give the player time to declare 66; `lastTrickCompletedAt` is set on trick completion and cleared on round end or declaration
- Validates card is in player's hand
- For leader: sets `currentTrick` with played card; processes marriage if declared; clears `canDeclareWindow` when no marriage is declared
- For follower: delegates to `playTrick()` which enforces follow-suit rules when deck is closed/exhausted, resolves trick winner, awards points, and draws from stock
- Ends round when hands exhausted: applies game points to match scores immediately (3 points if closer failed, otherwise `calculateGamePoints` based on loser's score)
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

## Close Deck Endpoint

`POST /rooms/:code/close-deck` allows the leader to close the deck, switching to closed-deck rules for the remainder of the round.

### Player Resolution

Same as play endpoint (hostToken query param or cookie).

### Responses

| Status | Condition |
|--------|-----------|
| 200 | Deck closed successfully |
| 409 | Not the leader, trick in progress, stock too small, deck already closed, no trump card, round/match already ended |

### Behavior

- Validates player is the leader and `canCloseDeck` passes
- Sets `isClosed` to true and `closedBy` to the closing player
- Broadcasts `game-state` to all connected clients

## Declare 66 Endpoint

`POST /rooms/:code/declare-66` allows a player to declare they have reached 66 points to win the round.

### Player Resolution

Same as play endpoint (hostToken query param or cookie).

### Responses

| Status | Condition |
|--------|-----------|
| 200 | Declaration successful (or false declaration penalized) |
| 409 | Cannot declare (window closed, round/match already ended) |

### Behavior

- Validates player can declare via `canDeclare66` (requires open declaration window for that player; does not require ≥66 points)
- Calls `declare66` to produce round result; if player truly has ≥66, they win; otherwise opponent wins with 2 game points (false declaration)
- Applies round result game points to match scores immediately
- Resets `lastTrickCompletedAt` to null
- Broadcasts `game-state` to all connected clients

## Ready Endpoint

`POST /rooms/:code/ready` marks a player as ready for the next round after a round ends.

### Player Resolution

Same as play endpoint (hostToken query param or cookie).

### Responses

| Status | Condition |
|--------|-----------|
| 200 | Player marked ready (or both ready, triggering new round) |
| 409 | Round has not ended, match already ended |

### Behavior

- Validates round has ended and match is not over
- Sets `hostReady` or `guestReady` based on the calling player
- When both players are ready: starts a new round via `startNewRound`, resets ready flags, broadcasts `game-state`
- When only one player ready: broadcasts `ready-state` with current ready flags

## Next Round Endpoint

`POST /rooms/:code/next-round` force-starts the next round after the countdown timer expires. Acts as a fallback when the ready-button flow is bypassed.

### Responses

| Status | Condition |
|--------|-----------|
| 200 | Next round started, or round already in progress (no-op) |
| 409 | Match already ended |

### Behavior

- No player authentication required (any connected client can trigger)
- If the current round has no result (already started), returns 200 with no changes
- Otherwise starts a new round via `startNewRound`, resets ready flags, broadcasts `game-state`

## Results Page

`GET /rooms/:code/results` renders the match results page when the match is over.

### Responses

| Status | Condition |
|--------|-----------|
| 200 | Match over or draw, renders results page |
| 303 | Match not over and not a draw, redirects to game page |
| 404/410 | Room not found / expired |

### Behavior

- Displays match winner, final match scores, last round breakdown (winner, reason, scores, game points), and win condition
- Shows "Victory by forfeit" / "Defeat by forfeit" when match ended via disconnect
- Shows "Match drawn" / "Both players disconnected" when match ended as a draw
- Includes "Return to Lobby" link

## Templates

HTML rendering with HTMX integration and Tailwind CSS styling.

- **Layout**: Common HTML shell with HTMX + SSE extension scripts, Tailwind CSS (CDN), Inter font, GSAP animation library
- **Pages**: Home, Join, Lobby, Game, Results
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
- **Close deck button**: Shown when the player can close (is leader, no trick in progress, stock has 3+ cards, deck not already closed, trump card exists); sends POST to `/rooms/:code/close-deck`; visibility updated in real-time via client-side state checks
- **Declare 66 button**: Shown when `canDeclare66` is true for the viewer (declaration window is open); styled with rose/red color; sends POST to `/rooms/:code/declare-66`; visibility updated in real-time via client-side state checks; displays error toast on failed attempts
- **Declare 66 grace countdown**: After a trick completes, a countdown ("Leader can play in X.Xs") is shown; stops when the next trick starts or the round ends; duration controlled by `declare66GracePeriodMs` from server state
- **Action notice toast**: Fixed-position notification element (top-right) for transient error feedback; auto-dismisses after 4 seconds; used for declare-66 failures
- **Opponent info hiding**: Game state sent to each viewer via `getViewerMatchState` replaces the opponent's hand with `{count}`, stock with `{count}`, and the opponent's round score with NaN, preventing clients from seeing hidden information
- **Real-time DOM updates**: Client-side JavaScript processes `game-state` events to update player hand, opponent hand count, trump card, stock pile, won pile displays, trick area, won counters, round scores, and match scores without full page reload; uses GSAP animations for card additions/removals
- **Click-to-play**: Player cards are clickable when it's the player's turn; clicking sends POST to `/rooms/:code/play`; automatically declares marriage when leading with K or Q of a declareable suit
- **Round-end modal**: Shown when a round ends; displays round winner, reason, round/match scores, and game points earned; includes a 10-second countdown timer and a "Ready" button that sends POST to `/rooms/:code/ready`; when countdown expires, sends POST to `/rooms/:code/next-round`; shows opponent ready state via `ready-state` SSE events; pauses countdown when opponent disconnects; redirects to `/rooms/:code/results` when match is over
- **Disconnect handling**: Monitors `status` SSE events for opponent connection state; pauses round-end countdown when opponent disconnects; shows "Opponent disconnected" status text; resumes countdown on reconnect
- **Draw redirect**: If the room is in draw state, the game page returns 303 redirect to the results page

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

**Declare 66 grace period**: `DECLARE_66_GRACE_PERIOD_MS = 2600` (exported from `src/game/config.ts`; used by server for play-delay enforcement and sent to clients in `ViewerMatchState`)

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
  canDeclareWindow: (0 | 1) | null;
  roundResult: RoundResult | null;
};

type RoundResult = {
  winner: 0 | 1;
  gamePoints: 1 | 2 | 3;
  reason: "declared_66" | "false_declaration" | "exhausted" | "closed_failed";
};

type HiddenCards = { count: number };

type ViewerGameState = Omit<GameState, "playerHands" | "stock"> & {
  playerHands: [Card[] | HiddenCards, Card[] | HiddenCards];
  stock: HiddenCards;
};

type ViewerMatchState = Omit<MatchState, "game"> & {
  game: ViewerGameState;
  declare66GracePeriodMs: number;
};

type PlayTrickResult = {
  game: GameState;
  winnerIndex: 0 | 1;
  trickPoints: number;
};
```

**Functions**:
- `dealInitialHands(deck, dealerIndex)`: Deals 6 cards per player (3, then trump, then 3 more), returns initial GameState with 11 cards in stock; sets `leader` to dealer's opponent
- `getStockCount(state)`: Returns number of cards remaining in stock
- `canCloseDeck(state, playerIndex)`: Returns true when player is the leader, no trick is in progress, stock has 3+ cards, deck is not already closed, trump card exists, and round hasn't ended
- `closeDeck(state, playerIndex)`: Sets `isClosed` to true and `closedBy` to the closing player; delegates to `canCloseDeck` for validation and throws specific errors (trick in progress, not leader, stock too small, already closed, no trump card)
- `canDeclare66(state, playerIndex)`: Returns true if the round hasn't ended and the declaration window is open for that player (does not check score threshold; declaring below 66 results in a false declaration penalty)
- `declare66(state, playerIndex)`: Returns new GameState with roundResult set; awards declaring player if they have ≥66 points, otherwise opponent wins with 2 game points
- `calculateGamePoints(opponentScore)`: Returns game points based on opponent score: 3 if 0, 2 if 1-32, 1 if ≥33
- `calculateWinPoints(state, closerIndex?)`: Returns win points for the round; if closer loses, returns 3 (penalty); otherwise uses calculateGamePoints
- `canExchangeTrump9(state, playerIndex)`: Returns true when no trick is in progress, player is leader, stock has 3+ cards, trump card is available, and player holds trump 9
- `exchangeTrump9(state, playerIndex)`: Swaps trump 9 in hand with trump card; throws when exchange not allowed
- `hasPotentialMarriage(hand, suit)`: Returns true if hand contains K and Q of suit
- `canDeclareMarriage(state, playerIndex, suit)`: Returns true if player can declare marriage (has K+Q and suit not already declared)
- `findDeclareableMarriages(state, playerIndex)`: Returns array of suits player can declare
- `declareMarriage(state, playerIndex, suit)`: Returns new GameState with marriage declared and points added; opens `canDeclareWindow` for the declaring player
- `isDeckClosedOrExhausted(state)`: Returns true if deck is closed or stock is empty
- `playTrick(state, leaderIndex, leaderCard, followerCard)`: Resolves a trick, removes cards from hands, awards winner the cards and points; sets `lastCompletedTrick` and clears `currentTrick`; opens `canDeclareWindow` for the trick winner; enforces follow-suit rules when deck is closed/exhausted; calls `drawFromStock` internally; returns `PlayTrickResult` (`{ game, winnerIndex, trickPoints }`)
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
- `startNewRound(matchState, roundWinnerIndex)`: Preserves current match scores, rotates dealer to loser, sets leader to winner, and deals fresh hands; throws if round hasn't ended or winner doesn't match result. Match scores are applied at play time (in the play endpoint), not during round transition
- `initializeMatch()`: Alias for `startMatch()`
- `isMatchOver(matchState)`: Returns true when either player has ≥11 points
- `getMatchWinner(matchState)`: Returns winning player index (0 or 1) or null if match not over; throws if tied at ≥11
- `getViewerMatchState(matchState, viewerIndex)`: Returns a `ViewerMatchState` with the opponent's hand replaced by `{count}`, stock replaced by `{count}`, the opponent's round score replaced by NaN, and `declare66GracePeriodMs` included
