import { renderHomePage } from "./templates/home";
import { renderLayout } from "./templates/layout";

const DEFAULT_PORT = 3000;
const ROOM_CODE_LENGTH = 6;

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

function roomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  let result = "";

  for (const value of bytes) {
    result += alphabet[value % alphabet.length];
  }

  return result;
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

  Bun.serve({
    port,
    fetch(request) {
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === "GET" && path === "/") {
        return htmlResponse(renderHomePage());
      }

      if (request.method === "POST" && path === "/rooms") {
        const code = roomCode();
        return Response.redirect(`/rooms/${code}`, 303);
      }

      if (request.method === "GET" && path === "/rooms") {
        const code = url.searchParams.get("code");
        if (code) {
          return Response.redirect(`/rooms/${encodeURIComponent(code)}`, 303);
        }
      }

      if (request.method === "GET" && path.startsWith("/rooms/")) {
        const code = decodeURIComponent(path.replace("/rooms/", "").trim());
        const safeCode = escapeHtml(code || "unknown");
        const body = `
          <main>
            <h1>Room ${safeCode}</h1>
          </main>
        `;
        return htmlResponse(renderLayout({ title: "Santase", body }));
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`Server listening on http://localhost:${port}`);
}
