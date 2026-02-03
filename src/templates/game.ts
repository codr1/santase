import { renderLayout } from "./layout";
import { escapeHtml } from "../utils/html";

type GameOptions = {
  code: string;
};

export function renderGamePage({ code }: GameOptions): string {
  const safeCode = escapeHtml(code);
  const body = `
    <main>
      <h1>Game Starting</h1>
      <p aria-label="Room code"><strong>${safeCode}</strong></p>
      <p>Placeholder game view.</p>
      <p><a href="/">Back to home</a></p>
    </main>
  `;

  return renderLayout({ title: "Game", body });
}
