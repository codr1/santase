import { existsSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { renderHomePage } from "./templates/home";
import { renderJoinPage } from "./templates/join";
import { renderLobbyPage } from "./templates/lobby";
import { renderGamePage } from "./templates/game";
import { renderResultsPage } from "./templates/results";
import { createRoom, getRoom, normalizeRoomCode, startRoomCleanup, touchRoom, type Room } from "./rooms";
import { broadcastGameState, broadcastReadyState, handleSse } from "./sse";
import { escapeHtml } from "./utils/html";
import {
  CARD_POINTS,
  calculateGamePoints,
  canDeclareMarriage,
  canCloseDeck,
  canExchangeTrump9,
  compareTrick,
  closeDeck,
  declareMarriage,
  drawFromStock,
  exchangeTrump9,
  getValidFollowerCards,
  isMatchOver,
  startNewRound,
  type Card,
  type Rank,
  type Suit,
} from "./game";

const DEFAULT_PORT = 3000;
const PUBLIC_ROOT = normalize(decodeURIComponent(new URL("../public", import.meta.url).pathname));

export function resolvePort(envPort: string | undefined): number {
  const parsedPort = envPort ? Number.parseInt(envPort, 10) : NaN;
  return Number.isNaN(parsedPort) ? DEFAULT_PORT : parsedPort;
}

function htmlResponse(
  body: string,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...headers,
    },
  });
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function jsonError(message: string, status = 400): Response {
  return jsonResponse({ ok: false, error: message }, status);
}

type RoomResolution = { room: Room } | { error: string; status: number };

function resolveRoom(normalizedCode: string): RoomResolution {
  const lookup = getRoom(normalizedCode, { includeMetadata: true });
  if (lookup.status === "active") {
    return { room: lookup.room };
  }
  if (lookup.status === "expired") {
    return { error: "Room expired. Start a new room.", status: 410 };
  }
  return { error: "Room not found. Double-check the code.", status: 404 };
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }
  const result: Record<string, string> = {};
  const pairs = cookieHeader.split(";").map((entry) => entry.trim());
  for (const pair of pairs) {
    if (!pair) {
      continue;
    }
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const name = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (!name) {
      continue;
    }
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value;
    }
  }
  return result;
}

function getHostCookieName(code: string): string {
  return `hostToken-${code}`;
}

function resolveViewerIndex(request: Request, room: Room): 0 | 1 {
  const url = new URL(request.url);
  const tokenFromQuery = url.searchParams.get("hostToken");
  const cookies = parseCookies(request.headers.get("cookie"));
  const tokenFromCookie = cookies[getHostCookieName(room.code)];
  const token = tokenFromQuery ?? tokenFromCookie;
  if (token && token === room.hostToken) {
    return room.hostPlayerIndex;
  }
  return room.hostPlayerIndex === 0 ? 1 : 0;
}

const ALLOWED_SUITS = new Set<Suit>(["hearts", "diamonds", "clubs", "spades"]);
const ALLOWED_RANKS = new Set<Rank>(["9", "10", "J", "Q", "K", "A"]);

function parseCard(input: unknown): Card | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  const suit = record.suit;
  const rank = record.rank;
  if (typeof suit !== "string" || typeof rank !== "string") {
    return null;
  }
  if (!ALLOWED_SUITS.has(suit as Suit) || !ALLOWED_RANKS.has(rank as Rank)) {
    return null;
  }
  return { suit: suit as Suit, rank: rank as Rank };
}

function parseSuit(input: unknown): Suit | null {
  if (typeof input !== "string") {
    return null;
  }
  return ALLOWED_SUITS.has(input as Suit) ? (input as Suit) : null;
}

function getActivePlayerIndex(game: { leader: 0 | 1; currentTrick: { leaderIndex: 0 | 1 } | null }): 0 | 1 {
  if (game.currentTrick) {
    return game.currentTrick.leaderIndex === 0 ? 1 : 0;
  }
  return game.leader;
}

function removeCardFromHand(hand: Card[], card: Card): { nextHand: Card[]; removed: boolean } {
  const index = hand.findIndex(
    (candidate) => candidate.suit === card.suit && candidate.rank === card.rank,
  );
  if (index < 0) {
    return { nextHand: hand, removed: false };
  }
  return {
    nextHand: [...hand.slice(0, index), ...hand.slice(index + 1)],
    removed: true,
  };
}

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "GET" && path.startsWith("/public/")) {
    const relativePath = decodeURIComponent(path.slice("/public/".length));
    if (!relativePath) {
      return new Response(escapeHtml("Not Found"), { status: 404 });
    }
    const resolvedPath = normalize(join(PUBLIC_ROOT, relativePath));
    const publicRootWithSep = PUBLIC_ROOT.endsWith(sep) ? PUBLIC_ROOT : `${PUBLIC_ROOT}${sep}`;
    if (!resolvedPath.startsWith(publicRootWithSep) || !existsSync(resolvedPath)) {
      return new Response(escapeHtml("Not Found"), { status: 404 });
    }
    return new Response(Bun.file(resolvedPath));
  }

  if (request.method === "GET" && path === "/") {
    return htmlResponse(renderHomePage());
  }

  if (request.method === "GET" && path === "/join") {
    return htmlResponse(renderJoinPage());
  }

  if (request.method === "POST" && path === "/rooms") {
    const room = createRoom();
    return Response.redirect(`/rooms/${room.code}/lobby`, 303);
  }

  if (request.method === "POST") {
    const exchangeMatch = path.match(/^\/rooms\/([^/]+)\/exchange-trump$/);
    if (exchangeMatch) {
      const normalizedCode = normalizeRoomCode(decodeURIComponent(exchangeMatch[1]));
      const resolution = resolveRoom(normalizedCode);
      if ("error" in resolution) {
        return jsonError(resolution.error, resolution.status);
      }
      const room = resolution.room;
      const playerIndex = resolveViewerIndex(request, room);
      const game = room.matchState.game;
      if (isMatchOver(room.matchState)) {
        return jsonError("Match already ended.", 409);
      }
      if (game.roundResult) {
        return jsonError("Round already ended.", 409);
      }
      if (game.leader !== playerIndex) {
        return jsonError("Only the leader can exchange the trump 9.", 409);
      }
      if (!canExchangeTrump9(game, playerIndex)) {
        return jsonError("Trump 9 exchange not allowed.", 409);
      }
      const nextGame = exchangeTrump9(game, playerIndex);
      room.matchState = { ...room.matchState, game: nextGame };
      touchRoom(normalizedCode);
      broadcastGameState(normalizedCode, room.matchState);
      return jsonResponse({ ok: true }, 200);
    }

    const closeDeckMatch = path.match(/^\/rooms\/([^/]+)\/close-deck$/);
    if (closeDeckMatch) {
      const normalizedCode = normalizeRoomCode(decodeURIComponent(closeDeckMatch[1]));
    const readyMatch = path.match(/^\/rooms\/([^/]+)\/ready$/);
    if (readyMatch) {
      const normalizedCode = normalizeRoomCode(decodeURIComponent(readyMatch[1]));
      const resolution = resolveRoom(normalizedCode);
      if ("error" in resolution) {
        return jsonError(resolution.error, resolution.status);
      }
      const room = resolution.room;
      const playerIndex = resolveViewerIndex(request, room);
      const game = room.matchState.game;
      if (isMatchOver(room.matchState)) {
        return jsonError("Match already ended.", 409);
      }
      if (game.roundResult) {
        return jsonError("Round already ended.", 409);
      }
      if (game.leader !== playerIndex) {
        return jsonError("Only the trick leader can close the deck.", 409);
      }
      if (!canCloseDeck(game, playerIndex)) {
        if (game.currentTrick) {
          return jsonError("Cannot close the deck during a trick.", 409);
        }
        if (game.stock.length < 3) {
          return jsonError("Stock must have at least 3 cards to close the deck.", 409);
        }
        if (game.isClosed) {
          return jsonError("Deck is already closed.", 409);
        }
        if (game.trumpCard === null) {
          return jsonError("Trump card is not available to close the deck.", 409);
        }
        return jsonError("Cannot close the deck.", 409);
      }
      const nextGame = closeDeck(game, playerIndex);
      room.matchState = { ...room.matchState, game: nextGame };
      if (!game.roundResult) {
        return jsonError("Round has not ended.", 409);
      }

      if (playerIndex === room.hostPlayerIndex) {
        room.hostReady = true;
      } else {
        room.guestReady = true;
      }

      if (room.hostReady && room.guestReady) {
        room.matchState = startNewRound(room.matchState, game.roundResult.winner);
        room.hostReady = false;
        room.guestReady = false;
        touchRoom(normalizedCode);
        broadcastGameState(normalizedCode, room.matchState);
      } else {
        touchRoom(normalizedCode);
        broadcastReadyState(normalizedCode, room.hostReady, room.guestReady);
      }

      return jsonResponse({ ok: true }, 200);
    }

    const nextRoundMatch = path.match(/^\/rooms\/([^/]+)\/next-round$/);
    if (nextRoundMatch) {
      const normalizedCode = normalizeRoomCode(decodeURIComponent(nextRoundMatch[1]));
      const resolution = resolveRoom(normalizedCode);
      if ("error" in resolution) {
        return jsonError(resolution.error, resolution.status);
      }
      const room = resolution.room;
      // Intentionally ungated: clients call this after their round-end timer expires, and
      // there is no per-player auth beyond the host token used elsewhere.
      if (isMatchOver(room.matchState)) {
        return jsonError("Match already ended.", 409);
      }
      const game = room.matchState.game;
      if (!game.roundResult) {
        return jsonResponse({ ok: true }, 200);
      }

      room.matchState = startNewRound(room.matchState, game.roundResult.winner);
      room.hostReady = false;
      room.guestReady = false;
      touchRoom(normalizedCode);
      broadcastGameState(normalizedCode, room.matchState);
      return jsonResponse({ ok: true }, 200);
    }

    const playMatch = path.match(/^\/rooms\/([^/]+)\/play$/);
    if (playMatch) {
      const normalizedCode = normalizeRoomCode(decodeURIComponent(playMatch[1]));
      const resolution = resolveRoom(normalizedCode);
      if ("error" in resolution) {
        return jsonError(resolution.error, resolution.status);
      }
      const room = resolution.room;
      let payload: { card?: Card; marriageSuit?: Suit; marriage?: Suit } | null = null;
      try {
        payload = await request.json();
      } catch {
        return jsonError("Invalid JSON payload.", 400);
      }
      const card = parseCard(payload?.card);
      if (!card) {
        return jsonError("Invalid card payload.", 400);
      }
      let marriageSuit: Suit | null = null;
      if (typeof payload?.marriageSuit !== "undefined") {
        marriageSuit = parseSuit(payload.marriageSuit);
        if (!marriageSuit) {
          return jsonError("Invalid marriageSuit payload.", 400);
        }
      } else if (typeof payload?.marriage !== "undefined") {
        marriageSuit = parseSuit(payload.marriage);
        if (!marriageSuit) {
          return jsonError("Invalid marriage payload.", 400);
        }
      }

      const playerIndex = resolveViewerIndex(request, room);
      const game = room.matchState.game;
      if (isMatchOver(room.matchState)) {
        return jsonError("Match already ended.", 409);
      }
      if (game.roundResult) {
        return jsonError("Round already ended.", 409);
      }

      const currentTrick = game.currentTrick;
      const activePlayerIndex = getActivePlayerIndex(game);
      if (playerIndex !== activePlayerIndex) {
        return jsonError("Not your turn to play.", 409);
      }
      if (!currentTrick) {
        let updatedGame = game;
        if (marriageSuit) {
          if (card.suit !== marriageSuit || (card.rank !== "K" && card.rank !== "Q")) {
            return jsonError("Marriage must match the played king or queen.", 400);
          }
          if (!canDeclareMarriage(updatedGame, playerIndex, marriageSuit)) {
            return jsonError("Marriage cannot be declared for this suit.", 400);
          }
          updatedGame = declareMarriage(updatedGame, playerIndex, marriageSuit);
        }

        const leaderHand = updatedGame.playerHands[playerIndex];
        const { nextHand, removed } = removeCardFromHand(leaderHand, card);
        if (!removed) {
          return jsonError("Card not found in hand.", 400);
        }
        const nextHands: [Card[], Card[]] =
          playerIndex === 0 ? [nextHand, updatedGame.playerHands[1]] : [updatedGame.playerHands[0], nextHand];
        const nextGame = {
          ...updatedGame,
          playerHands: nextHands,
          currentTrick: { leaderIndex: game.leader, leaderCard: card },
        };
        room.matchState = { ...room.matchState, game: nextGame };
        touchRoom(normalizedCode);
        broadcastGameState(normalizedCode, room.matchState);
        return jsonResponse({ ok: true }, 200);
      }

      const followerIndex: 0 | 1 = currentTrick.leaderIndex === 0 ? 1 : 0;
      if (marriageSuit) {
        return jsonError("Marriage declarations are only allowed when leading.", 400);
      }

      const followerHand = game.playerHands[playerIndex];
      if (game.isClosed || game.stock.length === 0) {
        const validFollowerCards = getValidFollowerCards(
          followerHand,
          currentTrick.leaderCard,
          game.trumpSuit,
          true,
        );
        const isValidFollowerCard = validFollowerCards.some(
          (candidate) => candidate.suit === card.suit && candidate.rank === card.rank,
        );
        if (!isValidFollowerCard) {
          return jsonError("Invalid follower card.", 400);
        }
      }
      const { nextHand, removed } = removeCardFromHand(followerHand, card);
      if (!removed) {
        return jsonError("Card not found in hand.", 400);
      }

      const nextHands: [Card[], Card[]] =
        playerIndex === 0 ? [nextHand, game.playerHands[1]] : [game.playerHands[0], nextHand];
      const winnerOffset = compareTrick(
        currentTrick.leaderCard,
        card,
        currentTrick.leaderCard.suit,
        game.trumpSuit,
      );
      const winnerIndex: 0 | 1 = winnerOffset === 0 ? currentTrick.leaderIndex : followerIndex;
      const trickPoints = CARD_POINTS[currentTrick.leaderCard.rank] + CARD_POINTS[card.rank];
      const nextWonTricks: [Card[], Card[]] = [
        [...game.wonTricks[0]],
        [...game.wonTricks[1]],
      ];
      nextWonTricks[winnerIndex] = [
        ...nextWonTricks[winnerIndex],
        currentTrick.leaderCard,
        card,
      ];
      const nextRoundScores: [number, number] = [
        game.roundScores[0],
        game.roundScores[1],
      ];
      nextRoundScores[winnerIndex] += trickPoints;

      let nextGame = {
        ...game,
        playerHands: nextHands,
        leader: winnerIndex,
        wonTricks: nextWonTricks,
        roundScores: nextRoundScores,
        currentTrick: null,
        lastCompletedTrick: {
          leaderIndex: currentTrick.leaderIndex,
          leaderCard: currentTrick.leaderCard,
          followerCard: card,
        },
      };

      nextGame = drawFromStock(nextGame, winnerIndex);

      let nextMatchState = { ...room.matchState, game: nextGame };
      if (
        !nextGame.roundResult &&
        nextGame.playerHands[0].length === 0 &&
        nextGame.playerHands[1].length === 0
      ) {
        const closerIndex = nextGame.closedBy;
        if (
          closerIndex !== null &&
          nextGame.isClosed &&
          nextGame.roundScores[closerIndex] < 66
        ) {
          const winner = closerIndex === 0 ? 1 : 0;
          const gamePoints = 3;
          nextGame = {
            ...nextGame,
            roundResult: { winner, gamePoints, reason: "closed_failed" },
          };
          nextMatchState = { ...nextMatchState, game: nextGame };
          const nextScores: [number, number] = [
            nextMatchState.matchScores[0],
            nextMatchState.matchScores[1],
          ];
          nextScores[winner] += gamePoints;
          nextMatchState = { ...nextMatchState, matchScores: nextScores };
        } else {
          const loserIndex = winnerIndex === 0 ? 1 : 0;
          const gamePoints = calculateGamePoints(nextGame.roundScores[loserIndex]);
          nextGame = {
            ...nextGame,
            roundResult: { winner: winnerIndex, gamePoints, reason: "exhausted" },
          };
          nextMatchState = { ...nextMatchState, game: nextGame };
          const nextScores: [number, number] = [
            nextMatchState.matchScores[0],
            nextMatchState.matchScores[1],
          ];
          nextScores[winnerIndex] += gamePoints;
          nextMatchState = { ...nextMatchState, matchScores: nextScores };
        }
      }

      room.matchState = nextMatchState;
      touchRoom(normalizedCode);
      broadcastGameState(normalizedCode, room.matchState);
      return jsonResponse({ ok: true }, 200);
    }
  }

  if (request.method === "GET" && path === "/rooms") {
    const code = url.searchParams.get("code");
    if (!code) {
      return htmlResponse(renderJoinPage({ error: "Enter a room code." }), 400);
    }
    const normalizedCode = normalizeRoomCode(code);
    const resolution = resolveRoom(normalizedCode);
    if ("error" in resolution) {
      return htmlResponse(
        renderJoinPage({ error: resolution.error, code: normalizedCode }),
        resolution.status,
      );
    }
    touchRoom(normalizedCode);
    return Response.redirect(`/rooms/${encodeURIComponent(normalizedCode)}`, 303);
  }

  if (request.method === "GET") {
    const sseMatch = path.match(/^\/sse\/([^/]+)$/);
    if (sseMatch) {
      const normalizedCode = normalizeRoomCode(decodeURIComponent(sseMatch[1]));
      return handleSse(request, normalizedCode);
    }

    const lobbyMatch = path.match(/^\/rooms\/([^/]+)\/lobby$/);
    if (lobbyMatch) {
      const normalizedCode = normalizeRoomCode(decodeURIComponent(lobbyMatch[1]));
      const resolution = resolveRoom(normalizedCode);
      if ("error" in resolution) {
        return htmlResponse(
          renderJoinPage({ error: resolution.error, code: normalizedCode }),
          resolution.status,
        );
      }
      touchRoom(normalizedCode);
      const cookieName = getHostCookieName(resolution.room.code);
      const cookieValue = encodeURIComponent(resolution.room.hostToken);
      const cookiePath = `/rooms/${encodeURIComponent(resolution.room.code)}`;
      return htmlResponse(
        renderLobbyPage({
          code: resolution.room.code,
          isHost: true,
          hostToken: resolution.room.hostToken,
        }),
        200,
        {
          "set-cookie": `${cookieName}=${cookieValue}; Path=${cookiePath}; SameSite=Lax; HttpOnly`,
        },
      );
    }

    const gameMatch = path.match(/^\/rooms\/([^/]+)\/game$/);
    if (gameMatch) {
      const normalizedCode = normalizeRoomCode(decodeURIComponent(gameMatch[1]));
      const resolution = resolveRoom(normalizedCode);
      if ("error" in resolution) {
        return htmlResponse(
          renderJoinPage({ error: resolution.error, code: normalizedCode }),
          resolution.status,
        );
      }
      touchRoom(normalizedCode);
      const viewerIndex = resolveViewerIndex(request, resolution.room);
      return htmlResponse(
        renderGamePage({
          code: resolution.room.code,
          matchState: resolution.room.matchState,
          viewerIndex,
          hostToken: viewerIndex === resolution.room.hostPlayerIndex ? resolution.room.hostToken : undefined,
        }),
      );
    }

    const resultsMatch = path.match(/^\/rooms\/([^/]+)\/results$/);
    if (resultsMatch) {
      const normalizedCode = normalizeRoomCode(decodeURIComponent(resultsMatch[1]));
      const resolution = resolveRoom(normalizedCode);
      if ("error" in resolution) {
        return htmlResponse(
          renderJoinPage({ error: resolution.error, code: normalizedCode }),
          resolution.status,
        );
      }
      touchRoom(normalizedCode);
      if (!isMatchOver(resolution.room.matchState)) {
        return Response.redirect(
          `/rooms/${encodeURIComponent(resolution.room.code)}/game`,
          303,
        );
      }
      const viewerIndex = resolveViewerIndex(request, resolution.room);
      return htmlResponse(
        renderResultsPage({
          code: resolution.room.code,
          matchState: resolution.room.matchState,
          viewerIndex,
        }),
      );
    }

    const roomMatch = path.match(/^\/rooms\/([^/]+)$/);
    if (roomMatch) {
      const normalizedCode = normalizeRoomCode(decodeURIComponent(roomMatch[1]));
      const resolution = resolveRoom(normalizedCode);
      if ("error" in resolution) {
        return htmlResponse(
          renderJoinPage({ error: resolution.error, code: normalizedCode }),
          resolution.status,
        );
      }
      touchRoom(normalizedCode);
      return htmlResponse(renderLobbyPage({ code: resolution.room.code }));
    }
  }

  return new Response(escapeHtml("Not Found"), { status: 404 });
}

if (import.meta.main) {
  const port = resolvePort(Bun.env.BUN_PORT);
  startRoomCleanup();

  Bun.serve({
    port,
    // Disable idle timeout: SSE connections are long-lived, and the 25s heartbeat
    // (see src/sse.ts:4) should not be cut off by any default timeout.
    idleTimeout: 0,
    fetch(request) {
      return handleRequest(request);
    },
  });

  console.log(`Server listening on http://localhost:${port}`);
}
