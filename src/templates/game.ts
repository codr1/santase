import { renderLayout } from "./layout";
import { escapeHtml } from "../utils/html";
import { getCardBackUrl, getCardImageUrl } from "./cards";
import { ROUND_RESULT_LABELS } from "./shared-constants";
import {
  renderIsHostDetectionSource,
  renderParseStatusPayloadSource,
  renderUpdateStatusTextSource,
} from "./shared-client";
import {
  canCloseDeck as canCloseDeckCheck,
  canDeclare66,
  canExchangeTrump9,
  DECLARE_66_GRACE_PERIOD_MS,
  getViewerMatchState,
} from "../game";
import type { Card, Suit } from "../game/cards";
import type { MatchState, ViewerMatchState } from "../game/state";

type GameOptions = {
  code: string;
  matchState: MatchState;
  viewerIndex: 0 | 1;
  hostToken?: string;
};

const SUIT_SYMBOLS: Record<Suit, { symbolHtml: string; label: string; colorClass: string }> = {
  hearts: { symbolHtml: "&hearts;", label: "Hearts", colorClass: "text-rose-300" },
  diamonds: { symbolHtml: "&diams;", label: "Diamonds", colorClass: "text-rose-200" },
  clubs: { symbolHtml: "&clubs;", label: "Clubs", colorClass: "text-emerald-200" },
  spades: { symbolHtml: "&spades;", label: "Spades", colorClass: "text-slate-200" },
};
const STOCK_PILE_CARDS_PER_LAYER = 4;
const STOCK_PILE_OFFSET_PX = 2;

function renderCardSvg(url: string, label?: string, extraClasses = ""): string {
  const aria = label
    ? `role="img" aria-label="${escapeHtml(label)}"`
    : `aria-hidden="true"`;
  const classes = `card-svg ${extraClasses}`.trim();
  return `
    <svg ${aria} class="${classes}" viewBox="0 0 169.075 244.640">
      <use href="${url}"></use>
    </svg>
  `;
}

function renderFaceUpCards(cards: Card[]): string {
  const fanLayout = getFanLayout(cards.length);
  return cards
    .map((card, index) => {
      const label = `${card.rank} of ${card.suit}`;
      const fanX = fanLayout.positions[index] ?? 50;
      const fanRot = fanLayout.rotations[index] ?? 0;
      return `<div
        class="player-card h-24 w-16 rounded-xl bg-slate-900/40 p-1 shadow-lg shadow-black/20 sm:h-28 sm:w-20"
        data-player-card="true"
        data-card-index="${index}"
        data-card-key="${card.rank}-${card.suit}"
        data-fan-x="${fanX}"
        data-fan-rot="${fanRot}"
        style="--fan-x:${fanX}%; --fan-rot:${fanRot}deg; --fan-index:${index};"
      >
        ${renderCardSvg(getCardImageUrl(card), label, "drop-shadow")}
      </div>`;
    })
    .join("");
}

function getFanLayout(count: number): { positions: number[]; rotations: number[] } {
  if (count <= 1) {
    return { positions: [50], rotations: [0] };
  }

  const positionStart = 14;
  const positionEnd = 86;
  const rotationStart = -18;
  const rotationEnd = 18;
  const positionStep = (positionEnd - positionStart) / (count - 1);
  const rotationStep = (rotationEnd - rotationStart) / (count - 1);
  const positions = Array.from({ length: count }, (_, index) =>
    Number((positionStart + positionStep * index).toFixed(2)),
  );
  const rotations = Array.from({ length: count }, (_, index) =>
    Number((rotationStart + rotationStep * index).toFixed(2)),
  );

  return { positions, rotations };
}

function renderFaceDownCards(count: number): string {
  const backUrl = getCardBackUrl();
  return Array.from({ length: count }, () => {
    return `<div class="h-24 w-16 rounded-xl bg-slate-900/30 p-1 shadow-lg shadow-black/20 sm:h-28 sm:w-20" data-opponent-card="true">
      ${renderCardSvg(backUrl, "Card back", "opacity-90")}
    </div>`;
  }).join("");
}

function renderEmptyCardSlot(variant: "standalone" | "inset" = "standalone"): string {
  const roundedClass = variant === "inset" ? "rounded-lg" : "rounded-xl";
  return `<div class="card-slot flex h-full w-full items-center justify-center ${roundedClass} border border-dashed border-emerald-200/50">
    <span class="text-xs text-emerald-200/70">Empty</span>
  </div>`;
}

function getStockPileLayers(count: number): number {
  return Math.max(0, Math.ceil(count / STOCK_PILE_CARDS_PER_LAYER));
}

function renderStockPile(count: number): string {
  if (count <= 0) {
    return renderEmptyCardSlot("inset");
  }
  const layers = getStockPileLayers(count);
  const stack = Array.from({ length: layers }, (_, index) => {
    const offset = (layers - 1 - index) * STOCK_PILE_OFFSET_PX;
    const isTop = index === layers - 1;
    return `<div class="absolute inset-0 rounded-xl bg-slate-900/30 p-1 shadow-lg shadow-black/20" style="transform: translateY(${offset}px); z-index:${index};">
      ${renderCardSvg(getCardBackUrl(), isTop ? "Stock pile" : undefined, "opacity-90")}
    </div>`;
  }).join("");
  return `<div class="relative h-full w-full" data-stock-stack="true">${stack}</div>`;
}

function renderTrickCard(card: Card, role: "leader" | "follower"): string {
  const label = `${card.rank} of ${card.suit}`;
  const rotation = role === "leader" ? -5 : 5;
  return `<div
    class="h-full w-full rounded-xl bg-slate-900/40 p-1 shadow-lg shadow-black/20"
    data-trick-card="${role}"
    data-card-key="${escapeHtml(`${card.rank}-${card.suit}`)}"
    data-rotation="${rotation}"
    style="transform: rotate(${rotation}deg);"
  >
    ${renderCardSvg(getCardImageUrl(card), label, "drop-shadow")}
  </div>`;
}

function renderTrickSlot(role: "leader" | "follower", card?: Card | null): string {
  const content = card ? renderTrickCard(card, role) : renderEmptyCardSlot();
  const cardKey = card ? `${card.rank}-${card.suit}` : "";
  return `<div class="h-24 w-16 sm:h-28 sm:w-20" data-trick-position="${role}" data-trick-slot="true" data-card-key="${escapeHtml(cardKey)}">
    ${content}
  </div>`;
}

function getActivePlayerIndex(
  game: Pick<MatchState["game"], "currentTrick" | "leader">,
): 0 | 1 {
  if (game.currentTrick) {
    return game.currentTrick.leaderIndex === 0 ? 1 : 0;
  }
  return game.leader;
}

function countCards(cards: Card[] | { count: number }): number {
  return Array.isArray(cards) ? cards.length : cards.count;
}

export function renderGamePage({ code, matchState, viewerIndex, hostToken }: GameOptions): string {
  const safeCode = escapeHtml(code);
  const tokenQuery = hostToken ? `?hostToken=${encodeURIComponent(hostToken)}` : "";
  const sseUrl = `/sse/${encodeURIComponent(code)}${tokenQuery}`;
  const safeSseUrl = escapeHtml(sseUrl);
  const viewerState: ViewerMatchState = getViewerMatchState(matchState, viewerIndex);
  const {
    game: {
      playerHands,
      trumpCard,
      trumpSuit,
      stock,
      wonTricks,
      roundScores,
    },
    matchScores,
  } = viewerState;
  const playerIndex = viewerIndex;
  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const playerHand = playerHands[playerIndex];
  const opponentHandCount = countCards(playerHands[opponentIndex]);
  if (!Array.isArray(playerHand)) {
    throw new Error("Viewer hand must be visible as an array.");
  }
  const playerWonCards = wonTricks[playerIndex].length;
  const opponentWonCards = wonTricks[opponentIndex].length;
  const playerWonTricks = Math.floor(playerWonCards / 2);
  const opponentWonTricks = Math.floor(opponentWonCards / 2);
  const displayTrick:
    | { leaderIndex: 0 | 1; leaderCard: Card; followerCard?: Card }
    | null = viewerState.game.currentTrick ?? viewerState.game.lastCompletedTrick ?? null;
  const leaderTrickCard = displayTrick?.leaderCard ?? null;
  const followerTrickCard = displayTrick?.followerCard ?? null;
  const trickStatusText = viewerState.game.currentTrick
    ? "Waiting for response"
    : displayTrick
      ? "Last trick complete"
      : "No cards played yet";
  const isWaitingForTurn = getActivePlayerIndex(viewerState.game) !== playerIndex;
  const suitMeta = SUIT_SYMBOLS[trumpSuit];
  const trumpCardMarkup = trumpCard
    ? renderCardSvg(getCardImageUrl(trumpCard), `${trumpCard.rank} of ${trumpCard.suit}`, "drop-shadow")
    : renderEmptyCardSlot("inset");
  const stockCount = stock.count;
  const stockPileMarkup = renderStockPile(stockCount);
  const canExchangeTrump = canExchangeTrump9(matchState.game, playerIndex);
  const canCloseDeck = canCloseDeckCheck(matchState.game, playerIndex);
  const canDeclare = canDeclare66(matchState.game, playerIndex);
  const opponentWonPileMarkup =
    opponentWonCards > 0
      ? renderCardSvg(getCardBackUrl(), "Opponent won pile", "opacity-80")
      : "";
  const playerWonPileMarkup =
    playerWonCards > 0 ? renderCardSvg(getCardBackUrl(), "Your won pile", "opacity-80") : "";
  const statusMarkup = `<span>Connecting...</span>`;
  const body = `
    <style>
      .player-hand {
        position: relative;
        height: 8rem;
      }
      .game-board[data-waiting="true"] {
        padding-bottom: clamp(3.5rem, 12vh, 9rem);
      }
      .card-svg {
        width: 100%;
        height: 100%;
      }
      @media (min-width: 640px) {
        .player-hand {
          height: 9rem;
        }
      }
      .player-card {
        position: absolute;
        bottom: 0;
        left: var(--fan-x, 50%);
        transform: translateX(-50%) rotate(var(--fan-rot, 0deg));
        transform-origin: 50% 120%;
        z-index: var(--fan-index, 0);
      }
    </style>
    <main
      hx-ext="sse"
      sse-connect="${safeSseUrl}"
      class="min-h-screen bg-emerald-950 px-4 py-6 text-emerald-50 sm:px-8"
    >
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Game Starting</h1>
        <div
          class="fixed right-4 top-4 z-50 max-w-xs rounded-xl bg-rose-500/95 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-black/30 sm:right-8"
          data-action-notice
          role="status"
          aria-live="polite"
          hidden
        ></div>
        <header class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-900/60 px-4 py-3 shadow-lg shadow-black/20 ring-1 ring-emerald-400/20">
          <div class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-[0.35em] text-emerald-200/80">Room</span>
            <span aria-label="Room code" class="text-2xl font-semibold tracking-[0.2em]">${safeCode}</span>
          </div>
          <p
            id="game-status"
            sse-swap="status"
            aria-live="polite"
            class="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-200/70"
          >
            ${statusMarkup}
          </p>
          <div class="flex items-center gap-3 rounded-xl bg-emerald-950/70 px-3 py-2 text-sm">
            <span class="text-emerald-200/80">Trump</span>
            <span class="text-lg font-semibold ${suitMeta.colorClass}">
              ${suitMeta.symbolHtml}
            </span>
            <span class="text-emerald-100">${suitMeta.label}</span>
          </div>
        </header>

        <section
          class="game-board flex flex-col gap-6 rounded-3xl bg-emerald-900/40 p-5 shadow-2xl shadow-black/30 ring-1 ring-emerald-200/20"
          data-waiting="${isWaitingForTurn ? "true" : "false"}"
        >
          <div class="flex flex-col gap-4">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p class="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Opponent</p>
                <p class="text-lg font-semibold">Top seat</p>
              </div>
              <div class="flex items-center gap-3 rounded-2xl bg-emerald-950/70 px-4 py-3 text-sm">
                <div class="flex flex-col">
                  <span class="text-emerald-200/70">Won tricks</span>
                  <span class="text-lg font-semibold" data-opponent-won-tricks="true">${opponentWonTricks}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-emerald-200/70">Cards</span>
                  <span class="text-lg font-semibold" data-opponent-won-cards="true">${opponentWonCards}</span>
                </div>
                <div class="flex h-24 w-16 items-center sm:h-28 sm:w-20" data-opponent-won-pile="true">
                  ${opponentWonPileMarkup}
                </div>
              </div>
            </div>
            <div class="flex flex-wrap items-center justify-center gap-2" data-opponent-hand="true">
              ${renderFaceDownCards(opponentHandCount)}
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div class="rounded-2xl bg-emerald-950/70 p-4 shadow-inner shadow-black/40">
              <p class="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Scores</p>
              <div class="mt-3 grid gap-3">
                <div class="flex items-center justify-between rounded-xl bg-emerald-900/60 px-3 py-2">
                  <span class="font-medium">You</span>
                  <div class="flex items-center gap-4 text-sm">
                    <span class="text-emerald-200/70">Round</span>
                    <span class="font-semibold" data-player-round-score="true">${roundScores[playerIndex]}</span>
                    <span class="text-emerald-200/70">Match</span>
                    <span class="font-semibold" data-player-match-score="true">${matchScores[playerIndex]}</span>
                  </div>
                </div>
                <div class="flex items-center justify-between rounded-xl bg-emerald-900/30 px-3 py-2">
                  <span class="font-medium">Opponent</span>
                  <div class="flex items-center gap-4 text-sm">
                    <span class="text-emerald-200/70">Round</span>
                    <span class="font-semibold">?</span>
                    <span class="text-emerald-200/70">Match</span>
                    <span class="font-semibold" data-opponent-match-score="true">${matchScores[opponentIndex]}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="rounded-2xl bg-emerald-950/70 p-4 shadow-inner shadow-black/40">
              <p class="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Current trick</p>
              <div class="mt-4 flex items-center justify-center gap-4" data-trick-area="true">
                ${renderTrickSlot("leader", leaderTrickCard)}
                ${renderTrickSlot("follower", followerTrickCard)}
              </div>
              <p class="mt-3 text-center text-xs text-emerald-200/70" data-trick-status="true">
                ${trickStatusText}
              </p>
              <p class="mt-2 text-center text-xs font-semibold text-amber-200" data-grace-countdown="true" hidden>
                Leader can play in 0.0s
              </p>
            </div>

            <div class="rounded-2xl bg-emerald-950/70 p-4 shadow-inner shadow-black/40">
              <p class="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Trump & Stock</p>
              <div class="mt-4 flex items-center justify-center gap-6">
                <div class="flex flex-col items-center gap-2">
                  <span class="text-xs text-emerald-200/70">Trump card</span>
                  <div
                    class="h-24 w-16 rounded-xl bg-slate-900/30 p-1 shadow-lg shadow-black/20 sm:h-28 sm:w-20"
                    data-trump-card="true"
                  >
                    ${trumpCardMarkup}
                  </div>
                </div>
                <div class="flex flex-col items-center gap-2">
                  <span class="text-xs text-emerald-200/70">Stock</span>
                  <div class="relative h-24 w-16 sm:h-28 sm:w-20" data-stock-pile="true">
                    ${stockPileMarkup}
                  </div>
                  <span class="text-sm font-semibold" data-stock-count="true">${stockCount} cards</span>
                </div>
              </div>
              <div class="mt-4 flex justify-center">
                <div class="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    class="rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-950 shadow-lg shadow-black/20 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-amber-200/60"
                    data-exchange-trump="true"
                    ${canExchangeTrump ? "" : "hidden"}
                  >
                    Exchange trump 9
                  </button>
                  <button
                    type="button"
                    class="rounded-full bg-rose-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white shadow-lg shadow-black/20 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-rose-300/60"
                    data-declare-66="true"
                    ${canDeclare ? "" : "hidden"}
                  >
                    Declare 66
                  </button>
                </div>
              </div>
              <div class="mt-3 flex justify-center">
                <button
                  type="button"
                  class="rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-950 shadow-lg shadow-black/20 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-amber-200/60"
                  data-close-deck="true"
                  ${canCloseDeck ? "" : "hidden"}
                >
                  Close deck
                </button>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-4">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p class="text-xs uppercase tracking-[0.3em] text-emerald-200/70">You</p>
                <p class="text-lg font-semibold">Bottom seat</p>
              </div>
              <div class="flex items-center gap-3 rounded-2xl bg-emerald-950/70 px-4 py-3 text-sm">
                <div class="flex flex-col">
                  <span class="text-emerald-200/70">Won tricks</span>
                  <span class="text-lg font-semibold" data-player-won-tricks="true">${playerWonTricks}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-emerald-200/70">Cards</span>
                  <span class="text-lg font-semibold" data-player-won-cards="true">${playerWonCards}</span>
                </div>
                <div class="flex h-24 w-16 items-center sm:h-28 sm:w-20" data-player-won-pile="true">
                  ${playerWonPileMarkup}
                </div>
              </div>
            </div>
            <div
              class="player-hand mx-auto w-full max-w-xl"
              data-player-hand="true"
              data-waiting="${isWaitingForTurn ? "true" : "false"}"
            >
              ${renderFaceUpCards(playerHand)}
            </div>
          </div>
        </section>
        <div id="game-state-listener" sse-swap="game-state" class="hidden"></div>
        <div id="ready-state-listener" sse-swap="ready-state" class="hidden"></div>

        <p class="text-center text-sm text-emerald-200/70">
          <a href="/" class="hover:underline">Back to home</a>
        </p>
      </div>
      <div
        data-round-end-modal
        hidden
        role="dialog"
        aria-modal="true"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      >
        <div class="w-full max-w-xl rounded-xl bg-emerald-900 p-6 shadow-lg">
          <p class="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Round complete</p>
          <div class="mt-2">
            <h2 class="text-2xl font-semibold" data-round-winner>Round complete</h2>
            <p class="text-sm text-emerald-200/80" data-round-reason></p>
          </div>
          <div class="mt-4 grid gap-3">
            <div class="flex items-center justify-between rounded-xl bg-emerald-950/70 px-4 py-3">
              <span class="font-medium">You</span>
              <div class="flex items-center gap-4 text-sm">
                <span class="text-emerald-200/70">Round</span>
                <span class="font-semibold" data-round-score-you>0</span>
                <span class="text-emerald-200/70">Match</span>
                <span class="font-semibold" data-match-score-you>0</span>
              </div>
            </div>
            <div class="flex items-center justify-between rounded-xl bg-emerald-900/40 px-4 py-3">
              <span class="font-medium">Opponent</span>
              <div class="flex items-center gap-4 text-sm">
                <span class="text-emerald-200/70">Round</span>
                <span class="font-semibold" data-round-score-opponent>0</span>
                <span class="text-emerald-200/70">Match</span>
                <span class="font-semibold" data-match-score-opponent>0</span>
              </div>
            </div>
          </div>
          <p class="mt-3 text-sm text-emerald-200/80">
            Game points earned: <span class="font-semibold" data-game-points>0</span>
          </p>
          <div
            class="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-emerald-950/70 px-4 py-3"
            data-round-end-actions
          >
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Next round in</p>
              <span class="text-3xl font-semibold" data-countdown>10</span>
            </div>
            <button
              type="button"
              class="rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-950 shadow-lg shadow-black/20 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-amber-200/60"
              data-ready-btn
            >
              Ready
            </button>
          </div>
          <p class="mt-3 text-sm text-emerald-200/80" data-opponent-ready hidden>
            Opponent is ready
          </p>
          <div class="mt-4 text-sm text-emerald-100/90" data-match-complete hidden>
            <p>Match complete. Thanks for playing!</p>
            <a href="/" class="mt-3 inline-flex text-sm font-semibold text-emerald-100 underline">
              Back to home
            </a>
          </div>
        </div>
      </div>
    </main>
    <script>
      const viewerIndex = ${playerIndex};
      const opponentIndex = ${opponentIndex};
      const roomCode = ${JSON.stringify(code)};
      const initialState = ${JSON.stringify(viewerState)};
      const defaultDeclare66GracePeriodMs = ${DECLARE_66_GRACE_PERIOD_MS};
      const declare66GracePeriodMs = Number.isFinite(initialState?.declare66GracePeriodMs)
        ? Math.max(0, Number(initialState.declare66GracePeriodMs))
        : defaultDeclare66GracePeriodMs;
      ${renderIsHostDetectionSource(Boolean(hostToken))}
      let currentState = initialState;
      const svgCardsCdn = "/public/svg-cards.svg";
      const cardBackUrl = svgCardsCdn + "#back";
      const stockPileCardsPerLayer = 4;
      const stockPileOffsetPx = 2;
      const suitIds = {
        hearts: "heart",
        diamonds: "diamond",
        clubs: "club",
        spades: "spade",
      };
      const rankIds = {
        "9": "9",
        "10": "10",
        J: "jack",
        Q: "queen",
        K: "king",
        A: "1",
      };
      const waitingFilter = "grayscale(0.45)";
      const waitingOpacity = 0.65;
      // ~10% of card height (h-24/h-28) to keep waiting cards lifted subtly.
      const waitingOffsetPx = 11;
      const trickResolutionDelayMs = 1000;
      const trickResolutionDuration = 0.6;
      const roundEndCountdownStart = 10;
      let animationsSettled = true;
      let activeAnimations = 0;
      let playRequestPending = false;
      let exchangeRequestPending = false;
      let closeRequestPending = false;
      let readyRequestPending = false;
      let nextRoundRequestPending = false;
      let roundEndCountdownId = null;
      let roundEndCountdownValue = roundEndCountdownStart;
      let roundEndCountdownPaused = false;
      let opponentConnected = true;
      const opponentLabel = "Opponent";
      let declareRequestPending = false;
      let pendingTrickResolutionKey = null;
      let latestReadyState = null;
      let graceCountdownIntervalId = null;
      let graceCountdownDeadlineMs = null;

      const roundResultLabels = ${JSON.stringify(ROUND_RESULT_LABELS)};

      const setText = (element, value) => {
        if (!element) {
          return;
        }
        element.textContent = String(value);
      };

      const roundEndModal = document.querySelector("[data-round-end-modal]");
      const roundWinnerEl = document.querySelector("[data-round-winner]");
      const roundReasonEl = document.querySelector("[data-round-reason]");
      const roundScoreYouEl = document.querySelector("[data-round-score-you]");
      const roundScoreOpponentEl = document.querySelector("[data-round-score-opponent]");
      const matchScoreYouEl = document.querySelector("[data-match-score-you]");
      const matchScoreOpponentEl = document.querySelector("[data-match-score-opponent]");
      const gamePointsEl = document.querySelector("[data-game-points]");
      const countdownEl = document.querySelector("[data-countdown]");
      const gameStatusEl = document.querySelector("#game-status");
      const readyButton = document.querySelector("[data-ready-btn]");
      const opponentReadyEl = document.querySelector("[data-opponent-ready]");
      const roundEndActionsEl = document.querySelector("[data-round-end-actions]");
      const matchCompleteEl = document.querySelector("[data-match-complete]");
      const actionNoticeEl = document.querySelector("[data-action-notice]");
      const graceCountdownEl = document.querySelector("[data-grace-countdown]");
      const actionNoticeAutoDismissMs = 4000;
      let actionNoticeTimeoutId = null;

      const hideActionNotice = () => {
        if (!actionNoticeEl) {
          return;
        }
        actionNoticeEl.hidden = true;
        actionNoticeEl.textContent = "";
      };

      const showActionNotice = (message) => {
        if (!actionNoticeEl) {
          return;
        }
        if (actionNoticeTimeoutId !== null) {
          window.clearTimeout(actionNoticeTimeoutId);
        }
        actionNoticeEl.textContent = message;
        actionNoticeEl.hidden = false;
        actionNoticeTimeoutId = window.setTimeout(() => {
          hideActionNotice();
          actionNoticeTimeoutId = null;
        }, actionNoticeAutoDismissMs);
      };

      const stopGraceCountdown = () => {
        if (graceCountdownIntervalId !== null) {
          window.clearInterval(graceCountdownIntervalId);
          graceCountdownIntervalId = null;
        }
        graceCountdownDeadlineMs = null;
        if (!graceCountdownEl) {
          return;
        }
        graceCountdownEl.hidden = true;
      };

      const updateGraceCountdown = () => {
        if (!graceCountdownEl || graceCountdownDeadlineMs === null) {
          return;
        }
        const remainingMs = Math.max(0, graceCountdownDeadlineMs - Date.now());
        const remainingSeconds = (remainingMs / 1000).toFixed(1);
        graceCountdownEl.textContent = "Leader can play in " + remainingSeconds + "s";
        graceCountdownEl.hidden = false;
        if (remainingMs <= 0) {
          stopGraceCountdown();
        }
      };

      const startGraceCountdown = (durationMs) => {
        const safeDurationMs = Number.isFinite(durationMs)
          ? Math.max(0, Number(durationMs))
          : declare66GracePeriodMs;
        if (safeDurationMs <= 0) {
          stopGraceCountdown();
          return;
        }
        stopGraceCountdown();
        graceCountdownDeadlineMs = Date.now() + safeDurationMs;
        updateGraceCountdown();
        graceCountdownIntervalId = window.setInterval(updateGraceCountdown, 100);
      };

      const resetRoundEndModal = (clearReadyState = false) => {
        roundEndCountdownValue = roundEndCountdownStart;
        roundEndCountdownPaused = false;
        setText(countdownEl, roundEndCountdownStart);
        if (opponentReadyEl) {
          opponentReadyEl.hidden = true;
        }
        if (readyButton) {
          readyButton.disabled = false;
          readyButton.textContent = "Ready";
        }
        readyRequestPending = false;
        if (clearReadyState) {
          latestReadyState = null;
        }
      };

      const isMatchOver = (state) => {
        if (state?.draw === true) {
          return true;
        }
        if (!state?.matchScores) {
          return false;
        }
        return state.matchScores[0] >= 11 || state.matchScores[1] >= 11;
      };

      const redirectToResults = () => {
        window.location.href = "/rooms/" + encodeURIComponent(roomCode) + "/results";
      };

      const getMatchWinnerIndex = (state) => {
        if (!state?.matchScores) {
          return null;
        }
        const [scoreA, scoreB] = state.matchScores;
        if (scoreA === scoreB) {
          return null;
        }
        return scoreA > scoreB ? 0 : 1;
      };

      const updateRoundEndModal = (state) => {
        const roundResult = state?.game?.roundResult;
        if (!roundResult) {
          return;
        }
        const matchOver = isMatchOver(state);
        const matchWinner = getMatchWinnerIndex(state);
        const winnerText = matchOver
          ? matchWinner === viewerIndex
            ? "You won the match!"
            : matchWinner === opponentIndex
              ? "Opponent won the match!"
              : "Match complete"
          : roundResult.winner === viewerIndex
            ? "You won!"
            : "Opponent won!";
        const reasonText = matchOver
          ? "Match complete"
          : roundResultLabels[roundResult.reason] ?? "Round complete";
        setText(roundWinnerEl, winnerText);
        setText(roundReasonEl, reasonText);
        setText(roundScoreYouEl, state.game.roundScores[viewerIndex]);
        setText(roundScoreOpponentEl, state.game.roundScores[opponentIndex]);
        setText(matchScoreYouEl, state.matchScores[viewerIndex]);
        setText(matchScoreOpponentEl, state.matchScores[opponentIndex]);
        setText(gamePointsEl, roundResult.gamePoints);
      };

      const syncOpponentReady = (readyState) => {
        if (!opponentReadyEl) {
          return;
        }
        if (currentState && isMatchOver(currentState)) {
          opponentReadyEl.hidden = true;
          return;
        }
        const opponentReady = isHost ? readyState?.guestReady : readyState?.hostReady;
        opponentReadyEl.hidden = !opponentReady;
      };

      const updateReadyButtonState = (readyState) => {
        if (!readyButton) {
          return;
        }
        if (currentState && isMatchOver(currentState)) {
          readyButton.disabled = true;
          readyButton.textContent = "Match complete";
          return;
        }
        const viewerReady = isHost ? readyState?.hostReady : readyState?.guestReady;
        if (viewerReady || readyRequestPending) {
          readyButton.disabled = true;
          readyButton.textContent = "Waiting...";
        } else {
          readyButton.disabled = false;
          readyButton.textContent = "Ready";
        }
      };

      const stopRoundEndCountdown = () => {
        if (roundEndCountdownId !== null) {
          window.clearInterval(roundEndCountdownId);
          roundEndCountdownId = null;
        }
      };

      const pauseCountdownForDisconnect = () => {
        if (!countdownEl) {
          return;
        }
        stopRoundEndCountdown();
        roundEndCountdownPaused = true;
        setText(countdownEl, "Waiting for " + opponentLabel + " to reconnect...");
        if (opponentReadyEl) {
          opponentReadyEl.hidden = true;
        }
      };

      const startRoundEndCountdown = () => {
        startRoundEndCountdownFromValue(false);
      };

      const startRoundEndCountdownFromValue = (resume) => {
        if (!countdownEl) {
          return;
        }
        stopRoundEndCountdown();
        if (
          !resume ||
          roundEndCountdownValue <= 0 ||
          roundEndCountdownValue > roundEndCountdownStart
        ) {
          roundEndCountdownValue = roundEndCountdownStart;
        }
        roundEndCountdownPaused = false;
        setText(countdownEl, roundEndCountdownValue);
        roundEndCountdownId = window.setInterval(async () => {
          if (!currentState?.game?.roundResult) {
            stopRoundEndCountdown();
            return;
          }
          if (!opponentConnected) {
            pauseCountdownForDisconnect();
            return;
          }
          if (isMatchOver(currentState)) {
            stopRoundEndCountdown();
            return;
          }
          roundEndCountdownValue -= 1;
          if (roundEndCountdownValue <= 0) {
            setText(countdownEl, 0);
            stopRoundEndCountdown();
            if (nextRoundRequestPending) {
              return;
            }
            nextRoundRequestPending = true;
            try {
              const response = await fetch(
                "/rooms/" + encodeURIComponent(roomCode) + "/next-round",
                {
                  method: "POST",
                  credentials: "same-origin",
                },
              );
              if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                console.warn("Next round rejected", response.status, errorText);
              }
            } catch (error) {
              console.warn("Failed to start next round", error);
            } finally {
              nextRoundRequestPending = false;
            }
          } else {
            setText(countdownEl, roundEndCountdownValue);
          }
        }, 1000);
      };

      const updateCountdownForConnection = () => {
        if (!countdownEl) {
          return;
        }
        if (!roundEndModal || roundEndModal.hasAttribute("hidden")) {
          return;
        }
        if (!currentState?.game?.roundResult) {
          return;
        }
        if (isMatchOver(currentState)) {
          return;
        }
        if (!opponentConnected) {
          pauseCountdownForDisconnect();
          return;
        }
        if (roundEndCountdownPaused) {
          startRoundEndCountdownFromValue(true);
        }
      };

      ${renderParseStatusPayloadSource()}

      ${renderUpdateStatusTextSource("gameStatusEl")}

      const applyMatchCompleteState = (state) => {
        const matchOver = isMatchOver(state);
        if (roundEndActionsEl) {
          roundEndActionsEl.hidden = matchOver;
        }
        if (matchCompleteEl) {
          matchCompleteEl.hidden = !matchOver;
        }
        if (matchOver) {
          if (opponentReadyEl) {
            opponentReadyEl.hidden = true;
          }
          stopRoundEndCountdown();
        }
      };

      const showRoundEndModal = (state) => {
        stopGraceCountdown();
        if (isMatchOver(state)) {
          redirectToResults();
          return;
        }
        if (!roundEndModal) {
          return;
        }
        resetRoundEndModal();
        updateRoundEndModal(state);
        applyMatchCompleteState(state);
        roundEndModal.removeAttribute("hidden");
        if (!isMatchOver(state)) {
          if (opponentConnected) {
            startRoundEndCountdown();
          } else {
            pauseCountdownForDisconnect();
          }
        }
        if (latestReadyState) {
          syncOpponentReady(latestReadyState);
          updateReadyButtonState(latestReadyState);
        }
      };

      const hideRoundEndModal = () => {
        if (!roundEndModal) {
          return;
        }
        roundEndModal.setAttribute("hidden", "");
        stopGraceCountdown();
        stopRoundEndCountdown();
        resetRoundEndModal(true);
        if (matchCompleteEl) {
          matchCompleteEl.hidden = true;
        }
        if (roundEndActionsEl) {
          roundEndActionsEl.hidden = false;
        }
      };

      const trackAnimations = (count) => {
        if (count <= 0) {
          return () => {};
        }
        activeAnimations += count;
        animationsSettled = false;
        return () => {
          activeAnimations = Math.max(0, activeAnimations - 1);
          if (activeAnimations === 0) {
            animationsSettled = true;
          }
        };
      };

      const cardKey = (card) => card.rank + "-" + card.suit;
      const parseCardKey = (key) => {
        if (!key) {
          return null;
        }
        const separatorIndex = key.lastIndexOf("-");
        if (separatorIndex <= 0 || separatorIndex === key.length - 1) {
          return null;
        }
        return {
          rank: key.slice(0, separatorIndex),
          suit: key.slice(separatorIndex + 1),
        };
      };
      const getCardImageUrl = (card) =>
        svgCardsCdn + "#" + suitIds[card.suit] + "_" + rankIds[card.rank];
      const renderCardSvg = (url, label, extraClasses = "") => {
        const aria = label ? 'role="img" aria-label="' + label + '"' : 'aria-hidden="true"';
        const classes = ("card-svg " + extraClasses).trim();
        return (
          '<svg ' +
          aria +
          ' class="' +
          classes +
          '" viewBox="0 0 169.075 244.640"><use href="' +
          url +
          '"></use></svg>'
        );
      };
      const renderEmptyCardSlot = (variant = "standalone") => {
        const roundedClass = variant === "inset" ? "rounded-lg" : "rounded-xl";
        return (
          '<div class="card-slot flex h-full w-full items-center justify-center ' +
          roundedClass +
          ' border border-dashed border-emerald-200/50">' +
          '<span class="text-xs text-emerald-200/70">Empty</span>' +
          "</div>"
        );
      };
      const getStockPileLayers = (count) => Math.max(0, Math.ceil(count / stockPileCardsPerLayer));
      const renderStockPile = (count) => {
        if (count <= 0) {
          return renderEmptyCardSlot("inset");
        }
        const layers = getStockPileLayers(count);
        let markup = '<div class="relative h-full w-full" data-stock-stack="true">';
        for (let index = 0; index < layers; index += 1) {
          const offset = (layers - 1 - index) * stockPileOffsetPx;
          const label = index === layers - 1 ? "Stock pile" : "";
          markup +=
            '<div class="absolute inset-0 rounded-xl bg-slate-900/30 p-1 shadow-lg shadow-black/20" style="transform: translateY(' +
            offset +
            "px); z-index:" +
            index +
            ';">' +
            renderCardSvg(cardBackUrl, label, "opacity-90") +
            "</div>";
        }
        return markup + "</div>";
      };
      const createTrickCardElement = (card, role) => {
        const label = card.rank + " of " + card.suit;
        const rotation = role === "leader" ? -5 : 5;
        const wrapper = document.createElement("div");
        wrapper.className = "h-full w-full rounded-xl bg-slate-900/40 p-1 shadow-lg shadow-black/20";
        wrapper.dataset.trickCard = role;
        wrapper.dataset.cardKey = cardKey(card);
        wrapper.dataset.rotation = String(rotation);
        wrapper.style.transform = "rotate(" + rotation + "deg)";
        wrapper.innerHTML = renderCardSvg(getCardImageUrl(card), label, "drop-shadow");
        return wrapper;
      };
      const escapeSelector = (value) => {
        if (window.CSS && typeof CSS.escape === "function") {
          return CSS.escape(value);
        }
        return value.replace(/"/g, '\\"');
      };
      const getTrickSourceElement = (card, playerIndex) => {
        if (!card || typeof playerIndex !== "number") {
          return null;
        }
        if (playerIndex === viewerIndex) {
          const hand = document.querySelector("[data-player-hand]");
          if (!hand) {
            return null;
          }
          const key = escapeSelector(cardKey(card));
          return hand.querySelector('[data-player-card][data-card-key="' + key + '"]') || hand;
        }
        const opponentHand = document.querySelector("[data-opponent-hand]");
        if (!opponentHand) {
          return null;
        }
        return opponentHand.querySelector("[data-opponent-card]") || opponentHand;
      };
      const getFanLayout = (count) => {
        if (count <= 1) {
          return { positions: [50], rotations: [0] };
        }
        const positionStart = 14;
        const positionEnd = 86;
        const rotationStart = -18;
        const rotationEnd = 18;
        const positionStep = (positionEnd - positionStart) / (count - 1);
        const rotationStep = (rotationEnd - rotationStart) / (count - 1);
        const positions = Array.from({ length: count }, (_, index) =>
          Number((positionStart + positionStep * index).toFixed(2)),
        );
        const rotations = Array.from({ length: count }, (_, index) =>
          Number((rotationStart + rotationStep * index).toFixed(2)),
        );
        return { positions, rotations };
      };
      const createPlayerCardElement = (card, index, fanX, fanRot) => {
        const label = card.rank + " of " + card.suit;
        const wrapper = document.createElement("div");
        wrapper.className =
          "player-card h-24 w-16 rounded-xl bg-slate-900/40 p-1 shadow-lg shadow-black/20 sm:h-28 sm:w-20";
        wrapper.dataset.playerCard = "true";
        wrapper.dataset.cardIndex = String(index);
        wrapper.dataset.cardKey = cardKey(card);
        wrapper.dataset.fanX = String(fanX);
        wrapper.dataset.fanRot = String(fanRot);
        wrapper.style.setProperty("--fan-x", fanX + "%");
        wrapper.style.setProperty("--fan-rot", fanRot + "deg");
        wrapper.style.setProperty("--fan-index", String(index));
        wrapper.innerHTML = renderCardSvg(getCardImageUrl(card), label, "drop-shadow");
        return wrapper;
      };
      const createOpponentCardElement = () => {
        const wrapper = document.createElement("div");
        wrapper.className = "h-24 w-16 rounded-xl bg-slate-900/30 p-1 shadow-lg shadow-black/20 sm:h-28 sm:w-20";
        wrapper.dataset.opponentCard = "true";
        wrapper.innerHTML = renderCardSvg(cardBackUrl, "Card back", "opacity-90");
        return wrapper;
      };
      const hasPotentialMarriage = (hand, suit) => {
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
      };
      const findDeclareableMarriages = (state, playerIndex) => {
        if (!state?.game) {
          return [];
        }
        const declared = new Set(state.game.declaredMarriages ?? []);
        const hand = state.game.playerHands[playerIndex] ?? [];
        return Object.keys(suitIds).filter(
          (suit) => !declared.has(suit) && hasPotentialMarriage(hand, suit),
        );
      };
      const getActivePlayerIndex = (game) => {
        if (!game) {
          return null;
        }
        if (game.currentTrick && typeof game.currentTrick.leaderIndex === "number") {
          return game.currentTrick.leaderIndex === 0 ? 1 : 0;
        }
        return game.leader;
      };
      const getHandCount = (hand) => {
        if (Array.isArray(hand)) {
          return hand.length;
        }
        const count = Number(hand?.count);
        return Number.isFinite(count) && count >= 0 ? count : 0;
      };
      const getStockCount = (stock) => {
        if (Array.isArray(stock)) {
          return stock.length;
        }
        const count = Number(stock?.count);
        return Number.isFinite(count) && count >= 0 ? count : 0;
      };
      const getDisplayTrick = (game) => game?.currentTrick ?? game?.lastCompletedTrick ?? null;
      const isPlayerTurn = (state, playerIndex) =>
        getActivePlayerIndex(state?.game) === playerIndex;
      const canExchangeTrump9State = (state, playerIndex) => {
        const game = state?.game;
        if (!game) {
          return false;
        }
        if (game.currentTrick) {
          return false;
        }
        if (game.leader !== playerIndex) {
          return false;
        }
        if (!game.trumpCard) {
          return false;
        }
        if (getStockCount(game.stock) <= 2) {
          return false;
        }
        const hand = game.playerHands?.[playerIndex] ?? [];
        if (!Array.isArray(hand)) {
          return false;
        }
        return hand.some((card) => card.rank === "9" && card.suit === game.trumpSuit);
      };
      const canCloseDeckState = (state, playerIndex) => {
        const game = state?.game;
        if (!game) {
          return false;
        }
        if (game.roundResult) {
          return false;
        }
        if (game.currentTrick) {
          return false;
        }
        if (game.leader !== playerIndex) {
          return false;
        }
        if (getStockCount(game.stock) < 3) {
          return false;
        }
        if (game.isClosed) {
          return false;
        }
        return game.trumpCard !== null;
      };
      const canDeclare66State = (state, playerIndex) => {
        const game = state?.game;
        if (!game || game.roundResult) {
          return false;
        }
        return game.canDeclareWindow === playerIndex;
      };
      const areCardsEqual = (left, right) =>
        Boolean(left && right && left.rank === right.rank && left.suit === right.suit);
      const areOptionalCardsEqual = (left, right) => {
        if (!left && !right) {
          return true;
        }
        if (!left || !right) {
          return false;
        }
        return areCardsEqual(left, right);
      };
      const areTricksEqual = (left, right) => {
        if (!left && !right) {
          return true;
        }
        if (!left || !right) {
          return false;
        }
        return (
          left.leaderIndex === right.leaderIndex &&
          areCardsEqual(left.leaderCard, right.leaderCard) &&
          areOptionalCardsEqual(left.followerCard, right.followerCard)
        );
      };
      const areHandsEqual = (left, right) => {
        if (!left || !right || left.length !== right.length) {
          return false;
        }
        return left.every((card, index) => areCardsEqual(card, right[index]));
      };
      const getTrickKey = (trick) => {
        if (!trick) {
          return null;
        }
        const leader = trick.leaderCard;
        const follower = trick.followerCard;
        if (!leader || !follower) {
          return null;
        }
        return [
          trick.leaderIndex,
          leader.rank + "-" + leader.suit,
          follower.rank + "-" + follower.suit,
        ].join("|");
      };
      const applyExchangeTrump9 = (state, playerIndex) => {
        if (!canExchangeTrump9State(state, playerIndex)) {
          return state;
        }
        const game = state.game;
        const hand = game.playerHands[playerIndex];
        const trumpIndex = hand.findIndex(
          (card) => card.rank === "9" && card.suit === game.trumpSuit,
        );
        if (trumpIndex < 0 || !game.trumpCard) {
          return state;
        }
        const trump9 = hand[trumpIndex];
        const nextHand = [
          ...hand.slice(0, trumpIndex),
          ...hand.slice(trumpIndex + 1),
          game.trumpCard,
        ];
        const nextHands =
          playerIndex === 0 ? [nextHand, game.playerHands[1]] : [game.playerHands[0], nextHand];
        return {
          ...state,
          game: {
            ...game,
            playerHands: nextHands,
            trumpCard: trump9,
          },
        };
      };
      const updateExchangeTrumpButton = (state) => {
        const button = document.querySelector("[data-exchange-trump]");
        if (!button) {
          return;
        }
        const canExchange = canExchangeTrump9State(state, viewerIndex);
        button.hidden = !canExchange;
        button.disabled = !canExchange || exchangeRequestPending;
      };
      const updateCloseDeckButton = (state) => {
        const button = document.querySelector("[data-close-deck]");
        if (!button) {
          return;
        }
        const canClose = canCloseDeckState(state, viewerIndex);
        button.hidden = !canClose;
        button.disabled = !canClose || closeRequestPending;
      };
      const updateDeclare66Button = (state) => {
        const button = document.querySelector("[data-declare-66]");
        if (!button) {
          return;
        }
        const canDeclare = canDeclare66State(state, viewerIndex);
        button.hidden = !canDeclare;
        button.disabled = !canDeclare || declareRequestPending;
      };
      const animateNewCards = (cards, isWaiting) => {
        if (!window.gsap || cards.length === 0) {
          return;
        }
        const completeAnimation = trackAnimations(cards.length);
        const waitingOffset = waitingOffsetPx;
        cards.forEach((card, index) => {
          const fanX = Number(card.dataset.fanX ?? "50");
          const fanRot = Number(card.dataset.fanRot ?? "0");
          window.gsap.fromTo(
            card,
            { left: "50%", xPercent: -50, y: 36, opacity: 0, rotation: 0, filter: "grayscale(0)" },
            {
              left: fanX + "%",
              xPercent: -50,
              y: isWaiting ? waitingOffset : 0,
              opacity: isWaiting ? waitingOpacity : 1,
              pointerEvents: isWaiting ? "none" : "auto",
              filter: isWaiting ? waitingFilter : "grayscale(0)",
              rotation: fanRot,
              duration: 0.6,
              ease: "power3.out",
              delay: index * 0.08,
              onComplete: completeAnimation,
            },
          );
        });
      };
      const animateExistingCards = (cards, isWaiting) => {
        if (!window.gsap || cards.length === 0) {
          return;
        }
        const completeAnimation = trackAnimations(cards.length);
        const waitingOffset = waitingOffsetPx;
        cards.forEach((card, index) => {
          const fanX = Number(card.dataset.fanX ?? "50");
          const fanRot = Number(card.dataset.fanRot ?? "0");
          window.gsap.to(card, {
            left: fanX + "%",
            xPercent: -50,
            y: isWaiting ? waitingOffset : 0,
            opacity: isWaiting ? waitingOpacity : 1,
            pointerEvents: isWaiting ? "none" : "auto",
            filter: isWaiting ? waitingFilter : "grayscale(0)",
            rotation: fanRot,
            duration: 0.45,
            ease: "power3.out",
            delay: index * 0.03,
            onComplete: completeAnimation,
          });
        });
      };
      const animateOpponentCards = (cards) => {
        if (!window.gsap || cards.length === 0) {
          return;
        }
        const completeAnimation = trackAnimations(cards.length);
        cards.forEach((card) => {
          window.gsap.fromTo(
            card,
            { opacity: 0, y: 12 },
            { opacity: 1, y: 0, duration: 0.35, onComplete: completeAnimation },
          );
        });
      };
      const updateWaitingState = (nextGame) => {
        const hand = document.querySelector("[data-player-hand]");
        const board = document.querySelector(".game-board");
        if (!hand) {
          return;
        }
        const activePlayer = getActivePlayerIndex(nextGame);
        const isWaiting = activePlayer !== viewerIndex;
        const waitingValue = isWaiting ? "true" : "false";
        hand.dataset.waiting = waitingValue;
        if (board) {
          board.dataset.waiting = waitingValue;
        }
      };
      const updatePlayerHand = (nextHand, nextGame) => {
        const hand = document.querySelector("[data-player-hand]");
        if (!hand) {
          return;
        }
        const wasWaiting = hand.dataset.waiting === "true";
        const nextKeys = new Set(nextHand.map(cardKey));
        const existingCards = Array.from(hand.querySelectorAll("[data-player-card]"));
        const existingByKey = new Map();
        existingCards.forEach((card) => {
          if (card.dataset.cardKey) {
            existingByKey.set(card.dataset.cardKey, card);
          }
        });
        existingCards.forEach((card) => {
          const key = card.dataset.cardKey;
          if (!key || !nextKeys.has(key)) {
            card.remove();
          }
        });
        const fanLayout = getFanLayout(nextHand.length);
        const newCards = [];
        const retainedCards = [];
        const movedCards = [];
        nextHand.forEach((card, index) => {
          const key = cardKey(card);
          const fanX = fanLayout.positions[index] ?? 50;
          const fanRot = fanLayout.rotations[index] ?? 0;
          let cardEl = existingByKey.get(key);
          if (!cardEl) {
            cardEl = createPlayerCardElement(card, index, fanX, fanRot);
            newCards.push(cardEl);
          } else {
            const prevFanX = Number(cardEl.dataset.fanX ?? "50");
            const prevFanRot = Number(cardEl.dataset.fanRot ?? "0");
            const prevIndex = Number(cardEl.dataset.cardIndex ?? "0");
            cardEl.dataset.cardIndex = String(index);
            cardEl.dataset.fanX = String(fanX);
            cardEl.dataset.fanRot = String(fanRot);
            cardEl.style.setProperty("--fan-x", fanX + "%");
            cardEl.style.setProperty("--fan-rot", fanRot + "deg");
            cardEl.style.setProperty("--fan-index", String(index));
            retainedCards.push(cardEl);
            if (prevFanX !== fanX || prevFanRot !== fanRot || prevIndex !== index) {
              movedCards.push(cardEl);
            }
          }
          hand.appendChild(cardEl);
        });
        const activePlayer = getActivePlayerIndex(nextGame);
        const isWaiting = activePlayer !== viewerIndex;
        updateWaitingState(nextGame);
        animateNewCards(newCards, isWaiting);
        const existingAnimationTargets = isWaiting === wasWaiting ? movedCards : retainedCards;
        animateExistingCards(existingAnimationTargets, isWaiting);
      };
      const updateOpponentHand = (nextCount) => {
        const hand = document.querySelector("[data-opponent-hand]");
        if (!hand) {
          return;
        }
        const currentCount = hand.querySelectorAll("[data-opponent-card]").length;
        if (currentCount === nextCount) {
          return;
        }
        if (nextCount > currentCount) {
          const newCards = [];
          for (let index = currentCount; index < nextCount; index += 1) {
            const cardEl = createOpponentCardElement();
            hand.appendChild(cardEl);
            newCards.push(cardEl);
          }
          animateOpponentCards(newCards);
        } else {
          const cards = Array.from(hand.querySelectorAll("[data-opponent-card]"));
          for (let index = cards.length - 1; index >= nextCount; index -= 1) {
            cards[index]?.remove();
          }
        }
      };
      const updateTrickArea = (nextGame, prevGame) => {
        const trickArea = document.querySelector("[data-trick-area]");
        if (!trickArea) {
          return;
        }
        const leaderSlot = trickArea.querySelector('[data-trick-position="leader"]');
        const followerSlot = trickArea.querySelector('[data-trick-position="follower"]');
        if (!leaderSlot || !followerSlot) {
          return;
        }
        const nextTrick = getDisplayTrick(nextGame);
        const prevTrick = getDisplayTrick(prevGame);
        const status = document.querySelector("[data-trick-status]");
        if (status) {
          if (nextGame?.currentTrick) {
            status.textContent = "Waiting for response";
          } else if (nextGame?.lastCompletedTrick) {
            status.textContent = "Last trick complete";
          } else {
            status.textContent = "No cards played yet";
          }
        }

        const leaderCard = nextTrick?.leaderCard ?? null;
        const followerCard = nextTrick?.followerCard ?? null;
        const leaderIndex = nextTrick?.leaderIndex ?? null;
        const followerIndex =
          typeof leaderIndex === "number" ? (leaderIndex === 0 ? 1 : 0) : null;

        const animateIntoSlot = (slot, card, role, sourceIndex) => {
          if (!slot) {
            return;
          }
          if (!card) {
            slot.dataset.cardKey = "";
            slot.innerHTML = renderEmptyCardSlot();
            return;
          }
          const key = cardKey(card);
          if (slot.dataset.cardKey === key) {
            return;
          }
          slot.dataset.cardKey = key;
          const cardEl = createTrickCardElement(card, role);
          slot.innerHTML = "";
          slot.appendChild(cardEl);

          const rotation = Number(cardEl.dataset.rotation ?? "0");
          const sourceEl = getTrickSourceElement(card, sourceIndex);
          if (!window.gsap || !sourceEl) {
            cardEl.style.transform = "rotate(" + rotation + "deg)";
            return;
          }

          const sourceRect = sourceEl.getBoundingClientRect();
          const targetRect = cardEl.getBoundingClientRect();
          const deltaX = sourceRect.left - targetRect.left;
          const deltaY = sourceRect.top - targetRect.top;
          const completeAnimation = trackAnimations(1);
          window.gsap.fromTo(
            cardEl,
            { x: deltaX, y: deltaY, rotation: 0, opacity: 0 },
            {
              x: 0,
              y: 0,
              rotation: rotation,
              opacity: 1,
              duration: 0.55,
              ease: "power3.out",
              onComplete: completeAnimation,
            },
          );
        };

        if (!nextTrick && !prevTrick) {
          return;
        }
        animateIntoSlot(leaderSlot, leaderCard, "leader", leaderIndex);
        animateIntoSlot(followerSlot, followerCard, "follower", followerIndex);
      };
      const clearTrickArea = () => {
        const trickArea = document.querySelector("[data-trick-area]");
        if (!trickArea) {
          return;
        }
        const leaderSlot = trickArea.querySelector('[data-trick-position="leader"]');
        const followerSlot = trickArea.querySelector('[data-trick-position="follower"]');
        if (leaderSlot) {
          leaderSlot.dataset.cardKey = "";
          leaderSlot.innerHTML = renderEmptyCardSlot();
        }
        if (followerSlot) {
          followerSlot.dataset.cardKey = "";
          followerSlot.innerHTML = renderEmptyCardSlot();
        }
      };
      const detectTrickResolution = (prevGame, nextGame) => {
        if (!prevGame?.currentTrick || !nextGame || nextGame.currentTrick) {
          return null;
        }
        if (!prevGame.currentTrick.followerCard) {
          return null;
        }
        const nextTrick = nextGame.lastCompletedTrick;
        if (!nextTrick?.followerCard) {
          return null;
        }
        const prevWon = prevGame.wonTricks;
        const nextWon = nextGame.wonTricks;
        if (!prevWon || !nextWon) {
          return null;
        }
        const playerDelta = nextWon[viewerIndex].length - prevWon[viewerIndex].length;
        const opponentDelta = nextWon[opponentIndex].length - prevWon[opponentIndex].length;
        if (playerDelta <= 0 && opponentDelta <= 0) {
          return null;
        }
        if (playerDelta > 0 && opponentDelta > 0) {
          return null;
        }
        const winnerIndex = playerDelta > 0 ? viewerIndex : opponentIndex;
        return { trick: nextTrick, winnerIndex };
      };
      const animateTrickResolution = (trick, winnerIndex) => {
        if (!trick) {
          return;
        }
        const trickKeyValue = getTrickKey(trick);
        if (!trickKeyValue) {
          return;
        }
        pendingTrickResolutionKey = trickKeyValue;
        window.setTimeout(() => {
          if (pendingTrickResolutionKey !== trickKeyValue) {
            return;
          }
          const latestGame = currentState?.game;
          if (latestGame?.currentTrick) {
            return;
          }
          if (getTrickKey(latestGame?.lastCompletedTrick) !== trickKeyValue) {
            return;
          }
          const trickArea = document.querySelector("[data-trick-area]");
          if (!trickArea) {
            return;
          }
          const leaderSlot = trickArea.querySelector('[data-trick-position="leader"]');
          const followerSlot = trickArea.querySelector('[data-trick-position="follower"]');
          const leaderCard = leaderSlot?.querySelector("[data-trick-card]");
          const followerCard = followerSlot?.querySelector("[data-trick-card]");
          if (!leaderCard || !followerCard) {
            clearTrickArea();
            pendingTrickResolutionKey = null;
            return;
          }
          const winnerPileSelector =
            winnerIndex === viewerIndex ? "[data-player-won-pile]" : "[data-opponent-won-pile]";
          const winnerPile = document.querySelector(winnerPileSelector);
          if (!winnerPile || !window.gsap) {
            pendingTrickResolutionKey = null;
            return;
          }
          const pileRect = winnerPile.getBoundingClientRect();
          const cards = [leaderCard, followerCard];
          const completeAnimation = trackAnimations(cards.length);
          let completed = 0;
          cards.forEach((cardEl) => {
            const cardRect = cardEl.getBoundingClientRect();
            const clone = cardEl.cloneNode(true);
            if (!(clone instanceof HTMLElement)) {
              completed += 1;
              if (completed === cards.length) {
                clearTrickArea();
              }
              completeAnimation();
              return;
            }
            clone.style.position = "fixed";
            clone.style.left = cardRect.left + "px";
            clone.style.top = cardRect.top + "px";
            clone.style.width = cardRect.width + "px";
            clone.style.height = cardRect.height + "px";
            clone.style.margin = "0";
            clone.style.zIndex = "50";
            clone.style.pointerEvents = "none";
            clone.style.transformOrigin = "center center";
            document.body.appendChild(clone);
            const deltaX = pileRect.left - cardRect.left + (pileRect.width - cardRect.width) / 2;
            const deltaY = pileRect.top - cardRect.top + (pileRect.height - cardRect.height) / 2;
            window.gsap.to(clone, {
              x: deltaX,
              y: deltaY,
              scale: 0.3,
              opacity: 0.2,
              duration: trickResolutionDuration,
              ease: "power3.in",
              onComplete: () => {
                clone.remove();
                completed += 1;
                if (completed === cards.length) {
                  clearTrickArea();
                  pendingTrickResolutionKey = null;
                }
                completeAnimation();
              },
            });
          });
        }, trickResolutionDelayMs);
      };
      const updateTrumpCard = (nextTrumpCard) => {
        const trumpContainer = document.querySelector("[data-trump-card]");
        if (!trumpContainer) {
          return;
        }
        const nextKey = nextTrumpCard ? cardKey(nextTrumpCard) : "none";
        if (trumpContainer.dataset.trumpKey === nextKey) {
          return;
        }
        trumpContainer.dataset.trumpKey = nextKey;
        if (!nextTrumpCard) {
          trumpContainer.innerHTML = renderEmptyCardSlot("inset");
          return;
        }
        const label = nextTrumpCard.rank + " of " + nextTrumpCard.suit;
        trumpContainer.innerHTML = renderCardSvg(getCardImageUrl(nextTrumpCard), label, "drop-shadow");
      };
      const updateStockPile = (nextCount) => {
        const stockPile = document.querySelector("[data-stock-pile]");
        const stockCount = document.querySelector("[data-stock-count]");
        if (!stockPile) {
          return;
        }
        const currentCount = Number(stockPile.dataset.stockCount ?? "-1");
        if (currentCount === nextCount) {
          return;
        }
        stockPile.dataset.stockCount = String(nextCount);
        stockPile.innerHTML = renderStockPile(nextCount);
        if (stockCount) {
          stockCount.textContent = nextCount + " cards";
        }
      };
      const updateWonPile = (selector, nextCount, label) => {
        const pile = document.querySelector(selector);
        if (!pile) {
          return;
        }
        const currentCount = Number(pile.dataset.wonCount ?? "-1");
        if (currentCount === nextCount) {
          return;
        }
        pile.dataset.wonCount = String(nextCount);
        pile.innerHTML = nextCount > 0 ? renderCardSvg(cardBackUrl, label, "opacity-80") : "";
      };
      const updateWonCounts = (playerIndexValue, wonCards) => {
        const wonTricks = Math.floor(wonCards / 2);
        const trickSelector =
          playerIndexValue === viewerIndex ? "[data-player-won-tricks]" : "[data-opponent-won-tricks]";
        const cardSelector =
          playerIndexValue === viewerIndex ? "[data-player-won-cards]" : "[data-opponent-won-cards]";
        const trickEl = document.querySelector(trickSelector);
        if (trickEl) {
          trickEl.textContent = String(wonTricks);
        }
        const cardEl = document.querySelector(cardSelector);
        if (cardEl) {
          cardEl.textContent = String(wonCards);
        }
      };
      const updateScores = (nextState, previousState) => {
        const playerRoundEl = document.querySelector("[data-player-round-score]");
        const playerMatchEl = document.querySelector("[data-player-match-score]");
        const opponentMatchEl = document.querySelector("[data-opponent-match-score]");
        if (playerRoundEl) {
          const nextRound = nextState?.game?.roundScores?.[viewerIndex];
          const currentRound = previousState?.game?.roundScores?.[viewerIndex];
          if (typeof nextRound === "number" && nextRound !== currentRound) {
            playerRoundEl.textContent = String(nextRound);
          }
        }
        if (playerMatchEl) {
          const nextMatch = nextState?.matchScores?.[viewerIndex];
          const currentMatch = previousState?.matchScores?.[viewerIndex];
          if (typeof nextMatch === "number" && nextMatch !== currentMatch) {
            playerMatchEl.textContent = String(nextMatch);
          }
        }
        if (opponentMatchEl) {
          const nextMatch = nextState?.matchScores?.[opponentIndex];
          const currentMatch = previousState?.matchScores?.[opponentIndex];
          if (typeof nextMatch === "number" && nextMatch !== currentMatch) {
            opponentMatchEl.textContent = String(nextMatch);
          }
        }
      };

      const trumpContainer = document.querySelector("[data-trump-card]");
      if (trumpContainer) {
        trumpContainer.dataset.trumpKey = initialState.game.trumpCard
          ? cardKey(initialState.game.trumpCard)
          : "none";
      }
      const stockPile = document.querySelector("[data-stock-pile]");
      if (stockPile) {
        stockPile.dataset.stockCount = String(getStockCount(initialState.game.stock));
      }
      const playerWonPile = document.querySelector("[data-player-won-pile]");
      if (playerWonPile) {
        playerWonPile.dataset.wonCount = String(initialState.game.wonTricks[viewerIndex].length);
      }
      const opponentWonPile = document.querySelector("[data-opponent-won-pile]");
      if (opponentWonPile) {
        opponentWonPile.dataset.wonCount = String(initialState.game.wonTricks[opponentIndex].length);
      }

      document.addEventListener("DOMContentLoaded", () => {
        const hand = document.querySelector("[data-player-hand]");
        if (hand) {
          hand.addEventListener("click", async (event) => {
            const cardEl = event.target.closest("[data-player-card]");
            if (!cardEl || !(cardEl instanceof HTMLElement)) {
              return;
            }
            if (!animationsSettled) {
              return;
            }
            if (playRequestPending) {
              return;
            }
            if (!isPlayerTurn(currentState, viewerIndex)) {
              return;
            }
            const parsed = parseCardKey(cardEl.dataset.cardKey);
            if (!parsed) {
              return;
            }
            const payload = { card: parsed };
            const canDeclareMarriage =
              currentState?.game &&
              !currentState.game.currentTrick &&
              currentState.game.leader === viewerIndex;
            if (canDeclareMarriage && (parsed.rank === "K" || parsed.rank === "Q")) {
              const declareable = findDeclareableMarriages(currentState, viewerIndex);
              if (declareable.includes(parsed.suit)) {
                payload.marriageSuit = parsed.suit;
              }
            }
            playRequestPending = true;
            try {
              const response = await fetch("/rooms/" + encodeURIComponent(roomCode) + "/play", {
                method: "POST",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
              });
              if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                console.warn("Play rejected", response.status, errorText);
              }
            } catch (error) {
              console.warn("Failed to play card", error);
            } finally {
              playRequestPending = false;
            }
          });
        }
        const exchangeButton = document.querySelector("[data-exchange-trump]");
        if (exchangeButton) {
          exchangeButton.addEventListener("click", async () => {
            if (exchangeRequestPending) {
              return;
            }
            if (!canExchangeTrump9State(currentState, viewerIndex)) {
              return;
            }
            exchangeRequestPending = true;
            updateExchangeTrumpButton(currentState);
            try {
              const response = await fetch(
                "/rooms/" + encodeURIComponent(roomCode) + "/exchange-trump",
                {
                  method: "POST",
                  credentials: "same-origin",
                },
              );
              if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                console.warn("Trump exchange rejected", response.status, errorText);
              } else {
                const nextState = applyExchangeTrump9(currentState, viewerIndex);
                if (nextState !== currentState) {
                  updatePlayerHand(nextState.game.playerHands[viewerIndex], nextState.game);
                  updateTrumpCard(nextState.game.trumpCard);
                  currentState = nextState;
                }
              }
            } catch (error) {
              console.warn("Failed to exchange trump 9", error);
            } finally {
              exchangeRequestPending = false;
              updateExchangeTrumpButton(currentState);
              updateCloseDeckButton(currentState);
            }
          });
        }
        const closeButton = document.querySelector("[data-close-deck]");
        if (closeButton) {
          closeButton.addEventListener("click", async () => {
            if (closeRequestPending) {
              return;
            }
            if (!canCloseDeckState(currentState, viewerIndex)) {
              return;
            }
            closeRequestPending = true;
            updateCloseDeckButton(currentState);
            try {
              const response = await fetch(
                "/rooms/" + encodeURIComponent(roomCode) + "/close-deck",
                {
                  method: "POST",
                  credentials: "same-origin",
                },
              );
              if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                console.warn("Close deck rejected", response.status, errorText);
              }
            } catch (error) {
              console.warn("Failed to close deck", error);
            } finally {
              closeRequestPending = false;
              updateCloseDeckButton(currentState);
            }
          });
        }
        const declareButton = document.querySelector("[data-declare-66]");
        if (declareButton) {
          declareButton.addEventListener("click", async () => {
            if (declareRequestPending) {
              return;
            }
            if (!canDeclare66State(currentState, viewerIndex)) {
              return;
            }
            declareRequestPending = true;
            updateDeclare66Button(currentState);
            try {
              const response = await fetch(
                "/rooms/" + encodeURIComponent(roomCode) + "/declare-66",
                {
                  method: "POST",
                  credentials: "same-origin",
                },
              );
              if (!response.ok) {
                const body = await response.json().catch(() => null);
                console.warn("Declare 66 rejected", response.status, body);
                showActionNotice(body?.error || "Declare 66 failed. Try again.");
              }
            } catch (error) {
              showActionNotice("Declare 66 failed. Check your connection and try again.");
              console.warn("Failed to declare 66", error);
            } finally {
              declareRequestPending = false;
              updateDeclare66Button(currentState);
            }
          });
        }
        if (readyButton) {
          readyButton.addEventListener("click", async () => {
            if (readyRequestPending) {
              return;
            }
            if (!currentState?.game?.roundResult) {
              return;
            }
            if (isMatchOver(currentState)) {
              return;
            }
            readyRequestPending = true;
            updateReadyButtonState(latestReadyState);
            let requestSucceeded = false;
            try {
              const response = await fetch("/rooms/" + encodeURIComponent(roomCode) + "/ready", {
                method: "POST",
                credentials: "same-origin",
              });
              if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                console.warn("Ready state rejected", response.status, errorText);
              } else {
                requestSucceeded = true;
              }
            } catch (error) {
              console.warn("Failed to send ready state", error);
            }
            if (!requestSucceeded) {
              readyRequestPending = false;
            }
            updateReadyButtonState(latestReadyState);
          });
        }
        updateExchangeTrumpButton(currentState);
        updateCloseDeckButton(currentState);
        updateDeclare66Button(currentState);
        if (currentState?.game?.roundResult) {
          showRoundEndModal(currentState);
        }
        if (!window.gsap) {
          return;
        }
        const cards = Array.from(document.querySelectorAll("[data-player-card]"));
        const isWaiting = hand?.dataset.waiting === "true";
        const waitingOffset = waitingOffsetPx;
        const completeAnimation = trackAnimations(cards.length);
        cards.forEach((card, index) => {
          const fanX = Number(card.dataset.fanX ?? "50");
          const fanRot = Number(card.dataset.fanRot ?? "0");
          window.gsap.fromTo(
            card,
            { left: "50%", xPercent: -50, y: 36, opacity: 0, rotation: 0, filter: "grayscale(0)" },
            {
              left: fanX + "%",
              xPercent: -50,
              y: isWaiting ? waitingOffset : 0,
              opacity: isWaiting ? waitingOpacity : 1,
              pointerEvents: isWaiting ? "none" : "auto",
              filter: isWaiting ? waitingFilter : "grayscale(0)",
              rotation: fanRot,
              duration: 0.6,
              ease: "power3.out",
              delay: index * 0.08,
              onComplete: completeAnimation,
            },
          );
        });

      });
      document.body.addEventListener("htmx:sseMessage", (event) => {
        const detail = event.detail || {};
        if (detail.type !== "ready-state") return;
        const payload = detail.data || "{}";
        let parsedState = null;
        try {
          parsedState = JSON.parse(payload);
        } catch {
          console.warn("ready-state payload was not valid JSON");
          return;
        }
        latestReadyState = parsedState;
        syncOpponentReady(parsedState);
        updateReadyButtonState(parsedState);
      });

      document.body.addEventListener("htmx:sseMessage", (event) => {
        const detail = event.detail || {};
        if (detail.type !== "status") return;
        const payload = detail.data || "";
        const parsed = parseStatusPayload(payload);
        if (parsed) {
          updateStatusText(parsed.hostConnected, parsed.guestConnected);
          const nextOpponentConnected = isHost ? parsed.guestConnected : parsed.hostConnected;
          if (nextOpponentConnected === opponentConnected) {
            return;
          }
          opponentConnected = nextOpponentConnected;
          updateCountdownForConnection();
          return;
        }
        if (/waiting for opponent/i.test(payload)) {
          opponentConnected = false;
          updateCountdownForConnection();
          return;
        }
        if (/opponent connected/i.test(payload)) {
          opponentConnected = true;
          updateCountdownForConnection();
        }
      });

      document.body.addEventListener("htmx:sseMessage", (event) => {
        const detail = event.detail || {};
        if (detail.type !== "game-state") return;
        const payload = detail.data || "{}";
        let parsedState = null;
        try {
          parsedState = JSON.parse(payload);
        } catch {
          console.warn("game-state payload was not valid JSON");
          return;
        }

        if (!parsedState || !parsedState.game) {
          return;
        }

        if (isMatchOver(parsedState) && !parsedState.game.roundResult) {
          redirectToResults();
          return;
        }

        const nextGame = parsedState.game;
        const currentGame = currentState?.game;
        const trickJustCompleted = Boolean(currentGame?.currentTrick) &&
          !nextGame.currentTrick &&
          currentGame.leader !== nextGame.leader;
        if (nextGame.currentTrick || nextGame.roundResult) {
          stopGraceCountdown();
        } else if (trickJustCompleted) {
          startGraceCountdown(parsedState.declare66GracePeriodMs);
        }

        if (
          !currentGame ||
          !areTricksEqual(getDisplayTrick(currentGame), getDisplayTrick(nextGame))
        ) {
          updateTrickArea(nextGame, currentGame);
        }
        const trickResolution = currentGame ? detectTrickResolution(currentGame, nextGame) : null;
        if (trickResolution) {
          animateTrickResolution(trickResolution.trick, trickResolution.winnerIndex);
        }

        const nextActivePlayer = getActivePlayerIndex(nextGame);
        const currentActivePlayer = getActivePlayerIndex(currentGame);
        if (
          !currentGame ||
          currentActivePlayer !== nextActivePlayer ||
          !areHandsEqual(currentGame.playerHands[viewerIndex], nextGame.playerHands[viewerIndex])
        ) {
          updatePlayerHand(nextGame.playerHands[viewerIndex], nextGame);
        }

        if (
          !currentGame ||
          getHandCount(currentGame.playerHands[opponentIndex]) !==
            getHandCount(nextGame.playerHands[opponentIndex])
        ) {
          updateOpponentHand(getHandCount(nextGame.playerHands[opponentIndex]));
        }

        if (!currentGame || !areCardsEqual(currentGame.trumpCard, nextGame.trumpCard)) {
          updateTrumpCard(nextGame.trumpCard);
        }

        if (!currentGame || getStockCount(currentGame.stock) !== getStockCount(nextGame.stock)) {
          updateStockPile(getStockCount(nextGame.stock));
        }

        if (
          !currentGame ||
          currentGame.wonTricks[viewerIndex].length !== nextGame.wonTricks[viewerIndex].length
        ) {
          const nextCount = nextGame.wonTricks[viewerIndex].length;
          updateWonPile("[data-player-won-pile]", nextCount, "Your won pile");
          updateWonCounts(viewerIndex, nextCount);
        }

        if (
          !currentGame ||
          currentGame.wonTricks[opponentIndex].length !== nextGame.wonTricks[opponentIndex].length
        ) {
          const nextCount = nextGame.wonTricks[opponentIndex].length;
          updateWonPile(
            "[data-opponent-won-pile]",
            nextCount,
            "Opponent won pile",
          );
          updateWonCounts(opponentIndex, nextCount);
        }

        updateScores(parsedState, currentState);
        updateExchangeTrumpButton(parsedState);
        updateCloseDeckButton(parsedState);
        updateDeclare66Button(parsedState);

        currentState = parsedState;
        if (roundEndModal) {
          const hasRoundResult = Boolean(parsedState.game.roundResult);
          const isHidden = roundEndModal.hasAttribute("hidden");
          if (hasRoundResult && isMatchOver(parsedState)) {
            redirectToResults();
            return;
          }
          if (hasRoundResult) {
            if (isHidden) {
              showRoundEndModal(parsedState);
            } else {
              updateRoundEndModal(parsedState);
              applyMatchCompleteState(parsedState);
            }
          } else if (!hasRoundResult && !isHidden) {
            hideRoundEndModal();
          }
        }
      });
    </script>
  `;

  return renderLayout({ title: "Game", body });
}
