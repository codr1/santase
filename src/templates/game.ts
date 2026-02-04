import { renderLayout } from "./layout";
import { escapeHtml } from "../utils/html";

type GameOptions = {
  code: string;
};

export function renderGamePage({ code }: GameOptions): string {
  const safeCode = escapeHtml(code);
  const body = `
    <main class="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div class="flex w-full max-w-md flex-col items-center gap-4">
        <h1 class="text-4xl font-bold tracking-tight sm:text-5xl">Game Starting</h1>
        <p aria-label="Room code" class="flex items-center justify-center">
          <span class="rounded-2xl bg-black px-6 py-4 text-4xl font-bold tracking-[0.2em] text-white shadow-lg shadow-black/20 sm:text-5xl">
            ${safeCode}
          </span>
        </p>
        <p class="text-base text-slate-600">Placeholder game view.</p>
        <p>
          <a href="/" class="text-sm font-medium text-slate-600 hover:underline">Back to home</a>
        </p>
      </div>
    </main>
  `;

  return renderLayout({ title: "Game", body });
}
