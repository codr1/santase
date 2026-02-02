import { renderLayout } from "./layout";
import { escapeHtml } from "../utils/html";

type LobbyOptions = {
  code: string;
  isHost?: boolean;
  hostToken?: string;
};

export function renderLobbyPage({ code, isHost = false, hostToken }: LobbyOptions): string {
  const headline = isHost ? "Share this room code" : "Room";
  const tokenQuery = isHost && hostToken ? `?hostToken=${encodeURIComponent(hostToken)}` : "";
  const sseUrl = `/sse/${encodeURIComponent(code)}${tokenQuery}`;
  const safeCode = escapeHtml(code);
  const safeSseUrl = escapeHtml(sseUrl);
  const body = `
    <main hx-ext="sse" sse-connect="${safeSseUrl}">
      <h1>${headline}</h1>
      <p aria-label="Room code"><strong>${safeCode}</strong></p>
      <p>Waiting for opponent...</p>
      <p><a href="/">Back to home</a></p>
    </main>
  `;

  return renderLayout({ title: "Lobby", body });
}
