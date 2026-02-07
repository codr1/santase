import { describe, expect, test } from "bun:test";
import { renderGamePage } from "./game";
import type { MatchState } from "../game";

const createMatchState = (): MatchState => ({
  game: {
    playerHands: [
      [{ suit: "hearts", rank: "A" }],
      [{ suit: "spades", rank: "10" }],
    ],
    stock: [],
    trumpCard: { suit: "clubs", rank: "K" },
    trumpSuit: "clubs",
    isClosed: false,
    leader: 0,
    currentTrick: null,
    lastCompletedTrick: null,
    closedBy: null,
    wonTricks: [[], []],
    roundScores: [33, 31],
    declaredMarriages: [],
    canDeclareWindow: null,
    roundResult: null,
  },
  matchScores: [10, 10],
  dealerIndex: 0,
  leaderIndex: 0,
});

describe("renderGamePage round-end modal behavior", () => {
  test("final-round modal flow is not skipped by an immediate redirect", () => {
    const html = renderGamePage({
      code: "ROOM42",
      matchState: createMatchState(),
      viewerIndex: 0,
    });

    const showRoundEndModalSource = html.match(/const showRoundEndModal = \(state\) => \{[\s\S]*?\n      \};/);
    expect(showRoundEndModalSource).not.toBeNull();
    expect(showRoundEndModalSource?.[0]).not.toContain("if (isMatchOver(state)) {\n          redirectToResults();\n          return;\n        }");
    expect(showRoundEndModalSource?.[0]).toContain("roundEndModal.removeAttribute(\"hidden\");");

    const sseRoundResultSource = html.match(/if \(roundEndModal\) \{[\s\S]*?\n        \}/);
    expect(sseRoundResultSource).not.toBeNull();
    expect(sseRoundResultSource?.[0]).not.toContain("if (hasRoundResult && isMatchOver(parsedState)) {");
    expect(sseRoundResultSource?.[0]).toContain("showRoundEndModal(parsedState);");
    expect(sseRoundResultSource?.[0]).toContain("applyMatchCompleteState(parsedState);");
  });

  test("final-round modal schedules auto-redirect after timeout", () => {
    const html = renderGamePage({
      code: "ROOM42",
      matchState: createMatchState(),
      viewerIndex: 0,
    });

    expect(html).toContain("const matchCompleteRedirectDelayMs = 3000;");

    const showRoundEndModalSource = html.match(/const showRoundEndModal = \(state\) => \{[\s\S]*?\n      \};/);
    expect(showRoundEndModalSource).not.toBeNull();
    expect(showRoundEndModalSource?.[0]).toMatch(
      /if \(isMatchOver\(state\)\) \{[\s\S]*?window\.setTimeout\(\(\) => \{[\s\S]*?redirectToResults\(\);[\s\S]*?\}, matchCompleteRedirectDelayMs\);/,
    );
  });

  test("match-complete section includes direct results link", () => {
    const roomCode = "AB0D";
    const html = renderGamePage({
      code: roomCode,
      matchState: createMatchState(),
      viewerIndex: 0,
    });

    expect(html).toContain('data-results-link');
    expect(html).toContain(`href="/rooms/${encodeURIComponent(roomCode)}/results"`);
    expect(html).toContain("View results now");
    expect(html).toContain("resultsLink.addEventListener(\"click\", (event) => {");
    expect(html).toContain("event.preventDefault();");
    expect(html).toContain("redirectToResults();");
  });
});
