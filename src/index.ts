import { existsSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { renderHomePage } from "./templates/home";
import { renderJoinPage } from "./templates/join";
import { renderLobbyPage } from "./templates/lobby";
import { renderGamePage } from "./templates/game";
import { createRoom, getRoom, normalizeRoomCode, startRoomCleanup, touchRoom, type Room } from "./rooms";
import { handleSse } from "./sse";
import { escapeHtml } from "./utils/html";

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

export function handleRequest(request: Request): Response {
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
