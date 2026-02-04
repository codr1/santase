import { renderLayout } from "./layout";
import { escapeHtml } from "../utils/html";
import { getCardBackUrl, getCardImageUrl } from "./cards";
import type { Card, Suit } from "../game/cards";
import type { MatchState } from "../game/state";

type GameOptions = {
  code: string;
  matchState: MatchState;
  viewerIndex: 0 | 1;
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
    return `<div class="rounded-xl bg-slate-900/30 p-1 shadow-lg shadow-black/20">
      ${renderCardSvg(backUrl, "Card back", "opacity-90")}
    </div>`;
  }).join("");
}

function renderEmptyCardSlot(): string {
  return `<div class="flex h-24 w-16 items-center justify-center rounded-xl border border-dashed border-emerald-200/50 sm:h-28 sm:w-20">
    <span class="text-xs text-emerald-200/70">Empty</span>
  </div>`;
}

export function renderGamePage({ code, matchState, viewerIndex }: GameOptions): string {
  const safeCode = escapeHtml(code);
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
    <main class="min-h-screen bg-emerald-950 px-4 py-6 text-emerald-50 sm:px-8">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Game Starting</h1>
        <header class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-900/60 px-4 py-3 shadow-lg shadow-black/20 ring-1 ring-emerald-400/20">
          <div class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-[0.35em] text-emerald-200/80">Room</span>
            <span aria-label="Room code" class="text-2xl font-semibold tracking-[0.2em]">${safeCode}</span>
          </div>
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
                <div class="flex items-center">
                  ${opponentWonPileMarkup}
                </div>
              </div>
            </div>
            <div class="flex flex-wrap items-center justify-center gap-2">
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
              <div class="mt-4 flex items-center justify-center gap-4">
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
                  ${trumpCardMarkup}
                </div>
                <div class="flex flex-col items-center gap-2">
                  <span class="text-xs text-emerald-200/70">Stock</span>
                  <div class="rounded-xl bg-slate-900/30 p-1 shadow-lg shadow-black/20">
                    ${stockPileMarkup}
                  </div>
                  <span class="text-sm font-semibold">${stockCount} cards</span>
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
                <div class="flex items-center">
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

        <p class="text-center text-sm text-emerald-200/70">
          <a href="/" class="hover:underline">Back to home</a>
        </p>
      </div>
    </main>
    <script>
      document.addEventListener("DOMContentLoaded", () => {
        if (!window.gsap) {
          return;
        }
        const cards = Array.from(document.querySelectorAll("[data-player-card]"));
        const hand = document.querySelector("[data-player-hand]");
        const isWaiting = hand?.dataset.waiting === "true";
        const getWaitingOffset = () => Math.round(window.innerHeight * 0.33);
        const waitingOffset = getWaitingOffset();
        const waitingFilter = "grayscale(0.45)";
        const waitingOpacity = 0.65;
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
            window.gsap.set(cards, { y: getWaitingOffset() });
          });
        }
      });
    </script>
  `;

  return renderLayout({ title: "Game", body });
}
