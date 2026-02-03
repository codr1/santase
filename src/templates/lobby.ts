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
  const startGameSection = isHost
    ? `<div id="start-game" sse-swap="start-game"></div>`
    : "";
  const body = `
    <main hx-ext="sse" sse-connect="${safeSseUrl}">
      <h1>${headline}</h1>
      <p aria-label="Room code"><strong>${safeCode}</strong></p>
      <p id="lobby-status" sse-swap="status" aria-live="polite">Waiting for opponent...</p>
      ${startGameSection}
      <p><a href="/">Back to home</a></p>
    </main>
  `;

  return renderLayout({ title: "Lobby", body });
}
