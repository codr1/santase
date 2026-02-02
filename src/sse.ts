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

function removeClient(roomCode: string, client: SseClient): void {
  const clients = clientsByRoom.get(roomCode);
  if (!clients) {
    return;
  }
  clients.delete(client);
  if (clients.size === 0) {
    clientsByRoom.delete(roomCode);
  }

  const { hostConnected } = updateRoomConnections(roomCode);
  const room = getRoom(roomCode);
  if (room && client.role === "host" && !room.guestEverJoined && !hostConnected) {
    deleteRoom(roomCode);
    clientsByRoom.delete(roomCode);
  }
}

export function handleSse(request: Request, roomCode: string): Response {
  const room = getRoom(roomCode);
  if (!room) {
    return new Response("Room not found", { status: 404 });
  }

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

      if (role === "host") {
        room.hostConnected = true;
      } else {
        const isFirstGuest = !room.guestEverJoined;
        room.guestConnected = true;
        room.guestEverJoined = true;
        if (isFirstGuest) {
          broadcast(roomCode, "connected", "guest");
        }
      }

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
