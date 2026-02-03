import { renderLayout } from "./layout";
import { escapeHtml } from "../utils/html";
import { buttonBaseClasses } from "./styles";

type JoinOptions = {
  error?: string;
  code?: string;
};

export function renderJoinPage({ error, code }: JoinOptions = {}): string {
  const message = error
    ? `<p role="status" aria-live="polite" class="text-sm font-medium text-red-600">${escapeHtml(error)}</p>`
    : "";
  const value = code ? ` value="${escapeHtml(code)}"` : "";
  const body = `
    <main class="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 class="text-4xl font-bold tracking-tight sm:text-5xl">Join Room</h1>
      ${message}
      <form method="get" action="/rooms" class="flex w-full max-w-sm flex-col gap-4">
        <label for="room-code" class="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Room Code
        </label>
        <input
          id="room-code"
          name="code"
          type="text"
          required${value}
          class="w-full rounded-lg border border-black/20 px-4 py-3 text-base shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
        <button
          type="submit"
          class="${buttonBaseClasses} bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg focus:ring-emerald-500"
        >
          Join Room
        </button>
      </form>
      <p>
        <a href="/" class="text-sm font-medium text-slate-600 hover:underline">Back to home</a>
      </p>
    </main>
  `;

  return renderLayout({ title: "Join Room", body });
}
