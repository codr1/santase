import { renderLayout } from "./layout";
import { escapeHtml } from "../utils/html";
import {
  renderDisconnectSseSource,
  renderIsHostDetectionSource,
  renderParseStatusPayloadSource,
  renderUpdateStatusTextSource,
} from "./shared-client";

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
      const _lobbyTs = () => new Date().toISOString();
      const sseRootEl = document.querySelector("[sse-connect]");
      const gameStartListener = document.getElementById("game-start-listener");
      const lobbyStatusEl = document.getElementById("lobby-status");
      ${renderIsHostDetectionSource(isHost)}
      const hostToken = ${JSON.stringify(hostToken ?? null)};
      const opponentLabel = "Opponent";
      let sseProcessingEnabled = true;

      console.log("[" + _lobbyTs() + "] LOBBY-INIT isHost=" + isHost + " sseUrl=${safeSseUrl}");
      console.log("[" + _lobbyTs() + "] LOBBY-INIT sseRootEl=" + !!sseRootEl + " gameStartListener=" + !!gameStartListener);

      ${renderDisconnectSseSource()}

      const cleanupBeforeRedirect = () => {
        sseProcessingEnabled = false;
        disconnectSse();
      };

      if (gameStartListener) {
        console.log("[" + _lobbyTs() + "] LOBBY game-start listener attached");
        gameStartListener.addEventListener("htmx:afterSettle", (event) => {
          console.log("[" + _lobbyTs() + "] LOBBY game-start SSE event received", event.type);
          let destination = gameStartListener.textContent?.trim() || ${gamePathJson};
          if (isHost && hostToken) {
            destination += (destination.includes("?") ? "&" : "?") + "hostToken=" + encodeURIComponent(hostToken);
          }
          console.log("[" + _lobbyTs() + "] LOBBY redirecting to", destination);
          cleanupBeforeRedirect();
          window.location.assign(destination);
        });
      } else {
        console.log("[" + _lobbyTs() + "] LOBBY WARNING: no game-start listener element found (isHost=" + isHost + ")");
      }

      ${renderParseStatusPayloadSource()}
      ${renderUpdateStatusTextSource("lobbyStatusEl")}
      document.body.addEventListener("htmx:sseMessage", (event) => {
        if (!sseProcessingEnabled) {
          console.log("[" + _lobbyTs() + "] LOBBY SSE message ignored (processing disabled) type=" + (event.detail?.type || "unknown"));
          return;
        }
        const detail = event.detail || {};
        console.log("[" + _lobbyTs() + "] LOBBY SSE message type=" + detail.type);
        if (detail.type !== "status") return;
        const parsed = parseStatusPayload(detail.data || "");
        if (parsed) {
          console.log("[" + _lobbyTs() + "] LOBBY status update hostConn=" + parsed.hostConnected + " guestConn=" + parsed.guestConnected);
          updateStatusText(parsed.hostConnected, parsed.guestConnected);
        }
      });
    </script>
  `;

  return renderLayout({ title: "Lobby", body });
}
