import { renderLayout } from "./layout";
import { escapeHtml } from "../utils/html";
import { getMatchWinner, type MatchState } from "../game";

type ResultsOptions = {
  code: string;
  matchState: MatchState;
  viewerIndex: 0 | 1;
  forfeit: boolean;
};

const ROUND_RESULT_LABELS: Record<string, string> = {
  declared_66: "Declared 66",
  false_declaration: "False declaration",
  exhausted: "Last trick winner",
  closed_failed: "Failed to close",
};

export function renderResultsPage({
  code,
  matchState,
  viewerIndex,
  forfeit,
}: ResultsOptions): string {
  const safeCode = escapeHtml(code);
  const opponentIndex = viewerIndex === 0 ? 1 : 0;
  let matchWinner: 0 | 1 | null = null;
  try {
    matchWinner = getMatchWinner(matchState);
  } catch {
    matchWinner = null;
  }
  const winnerText =
    matchWinner === null
      ? "Match complete"
      : matchWinner === viewerIndex
        ? "You won!"
        : "You lost";
  const roundResult = matchState.game.roundResult;
  const roundWinnerText = roundResult
    ? roundResult.winner === viewerIndex
      ? "You"
      : "Opponent"
    : forfeit && matchWinner !== null
      ? matchWinner === viewerIndex
        ? "You"
        : "Opponent"
      : "Unknown";
  const roundReason = roundResult
    ? ROUND_RESULT_LABELS[roundResult.reason] ?? "Round complete"
    : forfeit
      ? "Forfeit"
      : "Round complete";
  const gamePoints = roundResult ? roundResult.gamePoints : "-";
  const winCondition = forfeit
    ? matchWinner === viewerIndex
      ? "Victory by forfeit"
      : "Defeat by forfeit"
    : roundResult
      ? roundResult.reason === "false_declaration" || roundResult.reason === "closed_failed"
        ? "Forfeit"
        : "Normal victory"
      : "Match complete";

  const body = `
    <main class="min-h-screen bg-emerald-950 px-4 py-8 text-emerald-50 sm:px-8">
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header class="rounded-2xl bg-emerald-900/60 px-6 py-5 shadow-lg shadow-black/20 ring-1 ring-emerald-400/20">
          <p class="text-xs uppercase tracking-[0.35em] text-emerald-200/70">Match complete</p>
          <h1 class="mt-2 text-3xl font-semibold sm:text-4xl">${winnerText}</h1>
          <p class="mt-3 text-sm text-emerald-200/80">Room code: <span class="font-semibold tracking-[0.2em]">${safeCode}</span></p>
        </header>

        <section class="rounded-2xl bg-emerald-900/40 p-6 shadow-2xl shadow-black/30 ring-1 ring-emerald-200/20">
          <p class="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Final match score</p>
          <div class="mt-4 grid gap-3">
            <div class="flex items-center justify-between rounded-xl bg-emerald-950/70 px-4 py-3">
              <span class="font-medium">You</span>
              <span class="text-lg font-semibold">${matchState.matchScores[viewerIndex]}</span>
            </div>
            <div class="flex items-center justify-between rounded-xl bg-emerald-900/40 px-4 py-3">
              <span class="font-medium">Opponent</span>
              <span class="text-lg font-semibold">${matchState.matchScores[opponentIndex]}</span>
            </div>
          </div>
        </section>

        <section class="rounded-2xl bg-emerald-900/40 p-6 shadow-2xl shadow-black/30 ring-1 ring-emerald-200/20">
          <p class="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Final round breakdown</p>
          <div class="mt-4 grid gap-3">
            <div class="flex items-center justify-between rounded-xl bg-emerald-950/70 px-4 py-3">
              <span class="font-medium">Round winner</span>
              <span class="text-sm font-semibold">${roundWinnerText}</span>
            </div>
            <div class="flex items-center justify-between rounded-xl bg-emerald-900/40 px-4 py-3">
              <span class="font-medium">Round reason</span>
              <span class="text-sm font-semibold">${roundReason}</span>
            </div>
            <div class="flex items-center justify-between rounded-xl bg-emerald-950/70 px-4 py-3">
              <span class="font-medium">Round scores</span>
              <span class="text-sm font-semibold">You ${matchState.game.roundScores[viewerIndex]} · Opponent ${matchState.game.roundScores[opponentIndex]}</span>
            </div>
            <div class="flex items-center justify-between rounded-xl bg-emerald-900/40 px-4 py-3">
              <span class="font-medium">Game points</span>
              <span class="text-sm font-semibold">${gamePoints}</span>
            </div>
          </div>
        </section>

        <section class="rounded-2xl bg-emerald-900/40 p-6 shadow-2xl shadow-black/30 ring-1 ring-emerald-200/20">
          <p class="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Win condition</p>
          <p class="mt-3 text-sm font-semibold">${winCondition}</p>
        </section>

        <div class="flex justify-center">
          <a
            href="/"
            class="inline-flex items-center justify-center rounded-full bg-amber-400 px-6 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-950 shadow-lg shadow-black/20 transition hover:bg-amber-300"
          >
            Return to Lobby
          </a>
        </div>
      </div>
    </main>
  `;

  return renderLayout({ title: "Match Results", body });
}
