import { deleteRoom, getRoom, touchRoom } from "./rooms";

const HEARTBEAT_INTERVAL_MS = 25_000;

type ClientRole = "host" | "guest";

type SseClient = {
  role: ClientRole;
  controller: ReadableStreamDefaultController<Uint8Array>;
  heartbeat: ReturnType<typeof setInterval> | null;
};

const encoder = new TextEncoder();
const clientsByRoom = new Map<string, Set<SseClient>>();

function resolveRole(requestUrl: string, hostToken: string): ClientRole {
  const url = new URL(requestUrl);
  const token = url.searchParams.get("hostToken");
  return token && token === hostToken ? "host" : "guest";
}

function encodeEvent(event: string, data: string): Uint8Array {
  const lines = data.split("\n").map((line) => `data: ${line}`).join("\n");
  const payload = `event: ${event}\n${lines}\n\n`;
  return encoder.encode(payload);
}

function encodeComment(comment: string): Uint8Array {
  return encoder.encode(`: ${comment}\n\n`);
}

function ensureRoomClients(code: string): Set<SseClient> {
  let clients = clientsByRoom.get(code);
  if (!clients) {
    clients = new Set();
    clientsByRoom.set(code, clients);
  }
  return clients;
}

function broadcast(roomCode: string, event: string, data: string): void {
  const clients = clientsByRoom.get(roomCode);
  if (!clients || clients.size === 0) {
    return;
  }
  const payload = encodeEvent(event, data);
  for (const client of clients) {
    try {
      client.controller.enqueue(payload);
    } catch {
      // Ignore enqueue errors for closed streams.
    }
  }
  touchRoom(roomCode);
}

export function startGame(roomCode: string): void {
  const destination = `/rooms/${encodeURIComponent(roomCode)}/game`;
  broadcast(roomCode, "game-start", destination);
}

function broadcastToRole(roomCode: string, role: ClientRole, event: string, data: string): void {
  const clients = clientsByRoom.get(roomCode);
  if (!clients || clients.size === 0) {
    return;
  }
  const payload = encodeEvent(event, data);
  for (const client of clients) {
    if (client.role !== role) {
      continue;
    }
    try {
      client.controller.enqueue(payload);
    } catch {
      // Ignore enqueue errors for closed streams.
    }
  }
  touchRoom(roomCode);
}

function sendHeartbeat(roomCode: string, client: SseClient): void {
  try {
    client.controller.enqueue(encodeComment("ping"));
    touchRoom(roomCode);
  } catch {
    // Ignore enqueue errors for closed streams.
  }
}

function updateRoomConnections(roomCode: string): { hostConnected: boolean; guestConnected: boolean } {
  const clients = clientsByRoom.get(roomCode);
  let hostConnected = false;
  let guestConnected = false;

  if (clients) {
    for (const client of clients) {
      if (client.role === "host") {
        hostConnected = true;
      }
      if (client.role === "guest") {
        guestConnected = true;
      }
      if (hostConnected && guestConnected) {
        break;
      }
    }
  }

  const room = getRoom(roomCode);
  if (room) {
    room.hostConnected = hostConnected;
    room.guestConnected = guestConnected;
  }

  return { hostConnected, guestConnected };
}

function statusMarkup(status: { guestConnected: boolean }): string {
  const message = status.guestConnected ? "Opponent connected" : "Waiting for opponent...";
  return `<span>${message}</span>`;
}

function startGameMarkup(
  roomCode: string,
  hostToken: string | undefined,
  status: { guestConnected: boolean },
): string {
  if (!status.guestConnected) {
    return "";
  }
  const tokenQuery = hostToken ? `?hostToken=${encodeURIComponent(hostToken)}` : "";
  const action = `/rooms/${encodeURIComponent(roomCode)}/start${tokenQuery}`;
  return `<button type="button" hx-post="${action}" hx-swap="none" aria-label="Start game">Start Game</button>`;
}

function removeClient(roomCode: string, client: SseClient): void {
  const clients = clientsByRoom.get(roomCode);
  if (!clients) {
    return;
  }
  clients.delete(client);
  if (clients.size === 0) {
    clientsByRoom.delete(roomCode);
  }

  const status = updateRoomConnections(roomCode);
  const room = getRoom(roomCode);
  if (room) {
    broadcast(roomCode, "status", statusMarkup(status));
    broadcastToRole(roomCode, "host", "start-game", startGameMarkup(roomCode, room.hostToken, status));

    if (client.role === "host" && !room.guestEverJoined && !status.hostConnected) {
      deleteRoom(roomCode, "host-left");
      clientsByRoom.delete(roomCode);
    }
  }
}

export function handleSse(request: Request, roomCode: string): Response {
  const lookup = getRoom(roomCode, { includeMetadata: true });
  if (lookup.status !== "active") {
    if (lookup.status === "expired") {
      const message =
        lookup.reason === "host-left" ? "Room closed because the host left." : "Room expired.";
      return new Response(message, { status: 410 });
    }
    return new Response("Room not found.", { status: 404 });
  }
  const { room } = lookup;

  const role = resolveRole(request.url, room.hostToken);
  let client: SseClient | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      client = {
        role,
        controller,
        heartbeat: null,
      };

      const clients = ensureRoomClients(roomCode);
      clients.add(client);

      if (role === "guest") {
        const isFirstGuest = !room.guestEverJoined;
        room.guestEverJoined = true;
        if (isFirstGuest) {
          broadcast(roomCode, "connected", "guest");
        }
      }

      const status = updateRoomConnections(roomCode);
      broadcast(roomCode, "status", statusMarkup(status));
      broadcastToRole(
        roomCode,
        "host",
        "start-game",
        startGameMarkup(roomCode, room.hostToken, status),
      );
      touchRoom(roomCode);
      client.heartbeat = setInterval(() => {
        if (client) {
          sendHeartbeat(roomCode, client);
        }
      }, HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener("abort", () => {
        if (!client) {
          return;
        }
        if (client.heartbeat) {
          clearInterval(client.heartbeat);
        }
        removeClient(roomCode, client);
        try {
          controller.close();
        } catch {
          // Ignore close errors for closed streams.
        }
      });
    },
    cancel() {
      if (!client) {
        return;
      }
      if (client.heartbeat) {
        clearInterval(client.heartbeat);
      }
      removeClient(roomCode, client);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
