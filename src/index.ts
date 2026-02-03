import { renderHomePage } from "./templates/home";
import { renderJoinPage } from "./templates/join";
import { renderLobbyPage } from "./templates/lobby";
import { createRoom, getRoom, normalizeRoomCode, startRoomCleanup, touchRoom } from "./rooms";
import { handleSse } from "./sse";
import { escapeHtml } from "./utils/html";

const DEFAULT_PORT = 3000;

export function resolvePort(envPort: string | undefined): number {
  const parsedPort = envPort ? Number.parseInt(envPort, 10) : NaN;
  return Number.isNaN(parsedPort) ? DEFAULT_PORT : parsedPort;
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

if (import.meta.main) {
  const port = resolvePort(Bun.env.BUN_PORT);
  startRoomCleanup();

  Bun.serve({
    port,
    fetch(request) {
      const url = new URL(request.url);
      const path = url.pathname;

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
        const startMatch = path.match(/^\/rooms\/([^/]+)\/start$/);
        if (startMatch) {
          const normalizedCode = normalizeRoomCode(decodeURIComponent(startMatch[1]));
          const room = getRoom(normalizedCode);
          if (!room) {
            return htmlResponse(renderJoinPage({ error: "Room not found.", code: normalizedCode }), 404);
          }
          const hostToken = url.searchParams.get("hostToken");
          if (!hostToken || hostToken !== room.hostToken) {
            return new Response("Forbidden", { status: 403 });
          }
          touchRoom(normalizedCode);
          return new Response(null, { status: 204 });
        }
      }

      if (request.method === "GET" && path === "/rooms") {
        const code = url.searchParams.get("code");
        if (!code) {
          return htmlResponse(renderJoinPage({ error: "Enter a room code." }), 400);
        }
        const normalizedCode = normalizeRoomCode(code);
        const room = getRoom(normalizedCode);
        if (!room) {
          return htmlResponse(
            renderJoinPage({ error: "Room not found.", code: normalizedCode }),
            404,
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
          const room = getRoom(normalizedCode);
          if (!room) {
            return htmlResponse(
              renderJoinPage({ error: "Room not found.", code: normalizedCode }),
              404,
            );
          }
          touchRoom(normalizedCode);
          return htmlResponse(
            renderLobbyPage({ code: room.code, isHost: true, hostToken: room.hostToken }),
          );
        }

        const roomMatch = path.match(/^\/rooms\/([^/]+)$/);
        if (roomMatch) {
          const normalizedCode = normalizeRoomCode(decodeURIComponent(roomMatch[1]));
          const room = getRoom(normalizedCode);
          if (!room) {
            return htmlResponse(
              renderJoinPage({ error: "Room not found.", code: normalizedCode }),
              404,
            );
          }
          touchRoom(normalizedCode);
          return htmlResponse(renderLobbyPage({ code: room.code }));
        }
      }

      return new Response(escapeHtml("Not Found"), { status: 404 });
    },
  });

  console.log(`Server listening on http://localhost:${port}`);
}
