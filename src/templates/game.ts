import { renderLayout } from "./layout";
import { escapeHtml } from "../utils/html";
import { getCardBackUrl, getCardImageUrl } from "./cards";
import type { Card, Suit } from "../game/cards";
import type { MatchState } from "../game/state";

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

function renderCardSvg(url: string, label?: string, extraClasses = ""): string {
  const aria = label
    ? `role="img" aria-label="${escapeHtml(label)}"`
    : `aria-hidden="true"`;
  const classes = `h-24 w-16 sm:h-28 sm:w-20 ${extraClasses}`.trim();
  return `
    <svg ${aria} class="${classes}">
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
        class="player-card rounded-xl bg-slate-900/40 p-1 shadow-lg shadow-black/20"
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
    return `<div class="rounded-xl bg-slate-900/30 p-1 shadow-lg shadow-black/20" data-opponent-card="true">
      ${renderCardSvg(backUrl, "Card back", "opacity-90")}
    </div>`;
  }).join("");
}

function renderEmptyCardSlot(): string {
  return `<div class="flex h-24 w-16 items-center justify-center rounded-xl border border-dashed border-emerald-200/50 sm:h-28 sm:w-20">
    <span class="text-xs text-emerald-200/70">Empty</span>
  </div>`;
}

export function renderGamePage({ code, matchState, viewerIndex, hostToken }: GameOptions): string {
  const safeCode = escapeHtml(code);
  const tokenQuery = hostToken ? `?hostToken=${encodeURIComponent(hostToken)}` : "";
  const sseUrl = `/sse/${encodeURIComponent(code)}${tokenQuery}`;
  const safeSseUrl = escapeHtml(sseUrl);
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
  } = matchState;
  const playerIndex = viewerIndex;
  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const playerHand = playerHands[playerIndex];
  const opponentHandCount = playerHands[opponentIndex].length;
  const playerWonCards = wonTricks[playerIndex].length;
  const opponentWonCards = wonTricks[opponentIndex].length;
  const playerWonTricks = Math.floor(playerWonCards / 2);
  const opponentWonTricks = Math.floor(opponentWonCards / 2);
  const isWaitingForTurn = matchState.game.leader !== playerIndex;
  const suitMeta = SUIT_SYMBOLS[trumpSuit];
  const trumpCardMarkup = trumpCard
    ? renderCardSvg(getCardImageUrl(trumpCard), `${trumpCard.rank} of ${trumpCard.suit}`, "drop-shadow")
    : renderEmptyCardSlot();
  const stockCount = stock.length;
  const stockPileMarkup =
    stockCount > 0
      ? renderCardSvg(getCardBackUrl(), "Stock pile", "opacity-90")
      : renderEmptyCardSlot();
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
                  <span class="text-lg font-semibold">${opponentWonTricks}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-emerald-200/70">Cards</span>
                  <span class="text-lg font-semibold">${opponentWonCards}</span>
                </div>
                <div class="flex items-center" data-opponent-won-pile="true">
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
                    <span class="font-semibold">${roundScores[playerIndex]}</span>
                    <span class="text-emerald-200/70">Match</span>
                    <span class="font-semibold">${matchScores[playerIndex]}</span>
                  </div>
                </div>
                <div class="flex items-center justify-between rounded-xl bg-emerald-900/30 px-3 py-2">
                  <span class="font-medium">Opponent</span>
                  <div class="flex items-center gap-4 text-sm">
                    <span class="text-emerald-200/70">Round</span>
                    <span class="font-semibold">${roundScores[opponentIndex]}</span>
                    <span class="text-emerald-200/70">Match</span>
                    <span class="font-semibold">${matchScores[opponentIndex]}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="rounded-2xl bg-emerald-950/70 p-4 shadow-inner shadow-black/40">
              <p class="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Current trick</p>
              <div class="mt-4 flex items-center justify-center gap-4" data-trick-area="true">
                ${renderEmptyCardSlot()}
                ${renderEmptyCardSlot()}
              </div>
              <p class="mt-3 text-center text-xs text-emerald-200/70">No cards played yet</p>
            </div>

            <div class="rounded-2xl bg-emerald-950/70 p-4 shadow-inner shadow-black/40">
              <p class="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Trump & Stock</p>
              <div class="mt-4 flex items-center justify-center gap-6">
                <div class="flex flex-col items-center gap-2">
                  <span class="text-xs text-emerald-200/70">Trump card</span>
                  <div data-trump-card="true">${trumpCardMarkup}</div>
                </div>
                <div class="flex flex-col items-center gap-2">
                  <span class="text-xs text-emerald-200/70">Stock</span>
                  <div class="rounded-xl bg-slate-900/30 p-1 shadow-lg shadow-black/20" data-stock-pile="true">
                    ${stockPileMarkup}
                  </div>
                  <span class="text-sm font-semibold" data-stock-count="true">${stockCount} cards</span>
                </div>
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
                  <span class="text-lg font-semibold">${playerWonTricks}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-emerald-200/70">Cards</span>
                  <span class="text-lg font-semibold">${playerWonCards}</span>
                </div>
                <div class="flex items-center" data-player-won-pile="true">
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

        <p class="text-center text-sm text-emerald-200/70">
          <a href="/" class="hover:underline">Back to home</a>
        </p>
      </div>
    </main>
    <script>
      const viewerIndex = ${playerIndex};
      const opponentIndex = ${opponentIndex};
      const initialState = ${JSON.stringify(matchState)};
      let currentState = initialState;
      const svgCardsCdn = "/public/svg-cards.svg";
      const cardBackUrl = svgCardsCdn + "#back";
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
      const getWaitingOffset = () => Math.round(window.innerHeight * 0.33);

      const cardKey = (card) => card.rank + "-" + card.suit;
      const getCardImageUrl = (card) =>
        svgCardsCdn + "#" + suitIds[card.suit] + "_" + rankIds[card.rank];
      const renderCardSvg = (url, label, extraClasses = "") => {
        const aria = label ? 'role="img" aria-label="' + label + '"' : 'aria-hidden="true"';
        const classes = ("h-24 w-16 sm:h-28 sm:w-20 " + extraClasses).trim();
        return '<svg ' + aria + ' class="' + classes + '"><use href="' + url + '"></use></svg>';
      };
      const renderEmptyCardSlot = () =>
        '<div class="flex h-24 w-16 items-center justify-center rounded-xl border border-dashed border-emerald-200/50 sm:h-28 sm:w-20">' +
        '<span class="text-xs text-emerald-200/70">Empty</span>' +
        "</div>";
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
        wrapper.className = "player-card rounded-xl bg-slate-900/40 p-1 shadow-lg shadow-black/20";
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
        wrapper.className = "rounded-xl bg-slate-900/30 p-1 shadow-lg shadow-black/20";
        wrapper.dataset.opponentCard = "true";
        wrapper.innerHTML = renderCardSvg(cardBackUrl, "Card back", "opacity-90");
        return wrapper;
      };
      const areCardsEqual = (left, right) =>
        Boolean(left && right && left.rank === right.rank && left.suit === right.suit);
      const areHandsEqual = (left, right) => {
        if (!left || !right || left.length !== right.length) {
          return false;
        }
        return left.every((card, index) => areCardsEqual(card, right[index]));
      };
      const animateNewCards = (cards, isWaiting) => {
        if (!window.gsap || cards.length === 0) {
          return;
        }
        const waitingOffset = getWaitingOffset();
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
            },
          );
        });
      };
      const animateExistingCards = (cards, isWaiting) => {
        if (!window.gsap || cards.length === 0) {
          return;
        }
        const waitingOffset = getWaitingOffset();
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
          });
        });
      };
      const animateOpponentCards = (cards) => {
        if (!window.gsap || cards.length === 0) {
          return;
        }
        cards.forEach((card) => {
          window.gsap.fromTo(card, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35 });
        });
      };
      const updateWaitingState = (nextLeader) => {
        const hand = document.querySelector("[data-player-hand]");
        const board = document.querySelector(".game-board");
        if (!hand) {
          return;
        }
        const isWaiting = nextLeader !== viewerIndex;
        const waitingValue = isWaiting ? "true" : "false";
        hand.dataset.waiting = waitingValue;
        if (board) {
          board.dataset.waiting = waitingValue;
        }
      };
      const updatePlayerHand = (nextHand, nextLeader) => {
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
        const isWaiting = nextLeader !== viewerIndex;
        updateWaitingState(nextLeader);
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
          trumpContainer.innerHTML = renderEmptyCardSlot();
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
        stockPile.innerHTML =
          nextCount > 0
            ? renderCardSvg(cardBackUrl, "Stock pile", "opacity-90")
            : renderEmptyCardSlot();
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

      const trumpContainer = document.querySelector("[data-trump-card]");
      if (trumpContainer) {
        trumpContainer.dataset.trumpKey = initialState.game.trumpCard
          ? cardKey(initialState.game.trumpCard)
          : "none";
      }
      const stockPile = document.querySelector("[data-stock-pile]");
      if (stockPile) {
        stockPile.dataset.stockCount = String(initialState.game.stock.length);
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
        if (!window.gsap) {
          return;
        }
        const cards = Array.from(document.querySelectorAll("[data-player-card]"));
        const hand = document.querySelector("[data-player-hand]");
        const isWaiting = hand?.dataset.waiting === "true";
        const waitingOffset = getWaitingOffset();
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
            },
          );
        });

        if (isWaiting) {
          window.addEventListener("resize", () => {
            const currentCards = Array.from(document.querySelectorAll("[data-player-card]"));
            if (currentCards.length === 0) {
              return;
            }
            window.gsap.set(currentCards, { y: getWaitingOffset() });
          });
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

        const nextGame = parsedState.game;
        const currentGame = currentState?.game;

        if (
          !currentGame ||
          currentGame.leader !== nextGame.leader ||
          !areHandsEqual(currentGame.playerHands[viewerIndex], nextGame.playerHands[viewerIndex])
        ) {
          updatePlayerHand(nextGame.playerHands[viewerIndex], nextGame.leader);
        }

        if (
          !currentGame ||
          currentGame.playerHands[opponentIndex].length !== nextGame.playerHands[opponentIndex].length
        ) {
          updateOpponentHand(nextGame.playerHands[opponentIndex].length);
        }

        if (!currentGame || !areCardsEqual(currentGame.trumpCard, nextGame.trumpCard)) {
          updateTrumpCard(nextGame.trumpCard);
        }

        if (!currentGame || currentGame.stock.length !== nextGame.stock.length) {
          updateStockPile(nextGame.stock.length);
        }

        if (!currentGame || currentGame.wonTricks[viewerIndex].length !== nextGame.wonTricks[viewerIndex].length) {
          updateWonPile("[data-player-won-pile]", nextGame.wonTricks[viewerIndex].length, "Your won pile");
        }

        if (
          !currentGame ||
          currentGame.wonTricks[opponentIndex].length !== nextGame.wonTricks[opponentIndex].length
        ) {
          updateWonPile(
            "[data-opponent-won-pile]",
            nextGame.wonTricks[opponentIndex].length,
            "Opponent won pile",
          );
        }

        currentState = parsedState;
      });
    </script>
  `;

  return renderLayout({ title: "Game", body });
}
