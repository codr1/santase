import { renderLayout } from "./layout";
import { escapeHtml } from "../utils/html";

type JoinOptions = {
  error?: string;
  code?: string;
};

export function renderJoinPage({ error, code }: JoinOptions = {}): string {
  const message = error
    ? `<p role="status" aria-live="polite">${escapeHtml(error)}</p>`
    : "";
  const value = code ? ` value="${escapeHtml(code)}"` : "";
  const body = `
    <main>
      <h1>Join Room</h1>
      ${message}
      <form method="get" action="/rooms">
        <label for="room-code">Room Code</label>
        <input id="room-code" name="code" type="text" required${value} />
        <button type="submit">Join Room</button>
      </form>
      <p><a href="/">Back to home</a></p>
    </main>
  `;

  return renderLayout({ title: "Join Room", body });
}
