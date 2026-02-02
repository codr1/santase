import { renderLayout } from "./layout";
import { escapeHtml } from "../utils/html";

type LobbyOptions = {
  code: string;
  isHost?: boolean;
};

export function renderLobbyPage({ code, isHost = false }: LobbyOptions): string {
  const headline = isHost ? "Share this room code" : "Room";
  const safeCode = escapeHtml(code);
  const body = `
    <main>
      <h1>${headline}</h1>
      <p aria-label="Room code"><strong>${safeCode}</strong></p>
      <p>Waiting for opponent...</p>
      <p><a href="/">Back to home</a></p>
    </main>
  `;

  return renderLayout({ title: "Lobby", body });
}
