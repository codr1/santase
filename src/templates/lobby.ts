import { renderLayout } from "./layout";
import { escapeHtml } from "../utils/html";

type LobbyOptions = {
  code: string;
  isHost?: boolean;
  hostToken?: string;
};

export function renderLobbyPage({ code, isHost = false, hostToken }: LobbyOptions): string {
  const headline = isHost ? "Share this room code" : "Joined room";
  const tokenQuery = isHost && hostToken ? `?hostToken=${encodeURIComponent(hostToken)}` : "";
  const sseUrl = `/sse/${encodeURIComponent(code)}${tokenQuery}`;
  const safeCode = escapeHtml(code);
  const safeSseUrl = escapeHtml(sseUrl);
  const gamePathJson = JSON.stringify(`/rooms/${encodeURIComponent(code)}/game`);
  const waitingStatusMarkup = `<span>Waiting for opponent...</span>`;
  const startGameSection = isHost
    ? `<div id="start-game" sse-swap="start-game" class="w-full max-w-sm"></div>`
    : "";
  const gameStartListener = `<div id="game-start-listener" sse-swap="game-start" class="hidden"></div>`;
  const body = `
    <main
      hx-ext="sse"
      sse-connect="${safeSseUrl}"
      class="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center"
    >
      <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">${headline}</h1>
      <p aria-label="Room code" class="flex items-center justify-center">
        <span class="rounded-2xl bg-black px-6 py-4 text-4xl font-bold tracking-[0.2em] text-white shadow-lg shadow-black/20 sm:text-5xl">
          ${safeCode}
        </span>
      </p>
      <p
        id="lobby-status"
        sse-swap="status"
        aria-live="polite"
        class="text-sm font-medium text-slate-600"
      >
        ${waitingStatusMarkup}
      </p>
      ${startGameSection}
      ${gameStartListener}
      <p>
        <a href="/" class="text-sm font-medium text-slate-600 hover:underline">Back to home</a>
      </p>
    </main>
    <script>
      const gameStartListener = document.getElementById("game-start-listener");
      const lobbyStatusEl = document.getElementById("lobby-status");
      const isHost = ${isHost ? "true" : "false"};
      if (gameStartListener) {
        console.log("[lobby] game-start listener attached");
        gameStartListener.addEventListener("htmx:afterSettle", (event) => {
          console.log("[lobby] SSE event", event.type, event.detail);
          const destination = gameStartListener.textContent?.trim() || ${gamePathJson};
          console.log("[lobby] redirect", destination);
          window.location.assign(destination);
        });
      }
      // Keep in sync with parseStatusPayload in src/templates/game.ts.
      const parseStatusPayload = (payload) => {
        if (!payload) {
          return null;
        }
        try {
          const parsed = JSON.parse(payload);
          if (parsed && typeof parsed === "object") {
            return {
              hostConnected: Boolean(parsed.hostConnected),
              guestConnected: Boolean(parsed.guestConnected),
            };
          }
        } catch {
          // Not JSON, fall through to HTML parsing.
        }
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(payload, "text/html");
          const span = doc.body.firstElementChild;
          if (!span) {
            return null;
          }
          const hostAttr = span.getAttribute("data-host-connected");
          const guestAttr = span.getAttribute("data-guest-connected");
          if (hostAttr === null || guestAttr === null) {
            return null;
          }
          return {
            hostConnected: hostAttr === "true",
            guestConnected: guestAttr === "true",
          };
        } catch {
          return null;
        }
      };
      const updateStatusText = (hostConnected, guestConnected) => {
        if (!lobbyStatusEl) {
          return;
        }
        const opponentIsConnected = isHost ? guestConnected : hostConnected;
        lobbyStatusEl.textContent = opponentIsConnected
          ? "Opponent connected"
          : "Waiting for opponent...";
      };
      document.body.addEventListener("htmx:sseMessage", (event) => {
        const detail = event.detail || {};
        if (detail.type !== "status") return;
        const parsed = parseStatusPayload(detail.data || "");
        if (parsed) {
          updateStatusText(parsed.hostConnected, parsed.guestConnected);
        }
      });
    </script>
  `;

  return renderLayout({ title: "Lobby", body });
}
