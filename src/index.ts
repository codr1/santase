import { renderHomePage } from "./templates/home";
import { renderLayout } from "./templates/layout";
import { createRoom, getRoom, startRoomCleanup, touchRoom } from "./rooms";

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

      if (request.method === "POST" && path === "/rooms") {
        const room = createRoom();
        return Response.redirect(`/rooms/${room.code}/lobby`, 303);
      }

      if (request.method === "GET" && path === "/rooms") {
        const code = url.searchParams.get("code");
        if (code) {
          const normalizedCode = code.toUpperCase();
          return Response.redirect(`/rooms/${encodeURIComponent(normalizedCode)}`, 303);
        }
      }

      if (request.method === "GET") {
        const lobbyMatch = path.match(/^\/rooms\/([^/]+)\/lobby$/);
        if (lobbyMatch) {
          const code = decodeURIComponent(lobbyMatch[1]).toUpperCase();
          const room = getRoom(code);
          if (!room) {
            return new Response("Not Found", { status: 404 });
          }
          touchRoom(code);
          const safeCode = escapeHtml(room.code);
          const body = `
            <main>
              <h1>Room ${safeCode}</h1>
              <p>Waiting in the lobby.</p>
            </main>
          `;
          return htmlResponse(renderLayout({ title: "Santase", body }));
        }

        const roomMatch = path.match(/^\/rooms\/([^/]+)$/);
        if (roomMatch) {
          const code = decodeURIComponent(roomMatch[1]).toUpperCase();
          return Response.redirect(`/rooms/${encodeURIComponent(code)}/lobby`, 303);
        }
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`Server listening on http://localhost:${port}`);
}
