import { deleteRoom, forfeitMatch, getRoom, touchRoom, type Room } from "./rooms";
import { getViewerMatchState, isMatchOver, type MatchState } from "./game";

const HEARTBEAT_INTERVAL_MS = 25_000;
const DISCONNECT_FORFEIT_TIMEOUT_MS = 30_000;

type ClientRole = "host" | "guest";

type SseClient = {
  role: ClientRole;
  viewerIndex: 0 | 1;
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

function startGame(roomCode: string): void {
  const destination = `/rooms/${encodeURIComponent(roomCode)}/game`;
  console.log(`Game starting: ${roomCode}`);
  broadcast(roomCode, "game-start", destination);
}

export function broadcastGameState(roomCode: string, matchState: MatchState): void {
  const clients = clientsByRoom.get(roomCode);
  if (!clients || clients.size === 0) {
    return;
  }
  for (const client of clients) {
    const visibleState = getViewerMatchState(matchState, client.viewerIndex);
    const payload = encodeEvent("game-state", JSON.stringify(visibleState));
    try {
      client.controller.enqueue(payload);
    } catch {
      // Ignore enqueue errors for closed streams.
    }
  }
  touchRoom(roomCode);
}

export function broadcastReadyState(
  roomCode: string,
  hostReady: boolean,
  guestReady: boolean,
): void {
  broadcast(roomCode, "ready-state", JSON.stringify({ hostReady, guestReady }));
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

function statusMarkup(status: { hostConnected: boolean; guestConnected: boolean }): string {
  const message = status.guestConnected ? "Opponent connected" : "Waiting for opponent...";
  return `<span data-host-connected="${status.hostConnected}" data-guest-connected="${status.guestConnected}">${message}</span>`;
}

function clearDisconnectTimeout(room: Room, role?: ClientRole): void {
  if (!room.disconnectTimeout) {
    return;
  }
  if (role && room.disconnectPendingRole && room.disconnectPendingRole !== role) {
    return;
  }
  clearTimeout(room.disconnectTimeout);
  room.disconnectTimeout = null;
  room.disconnectPendingRole = null;
}

function startDisconnectTimeout(
  roomCode: string,
  room: Room,
  disconnectedRole: ClientRole,
): void {
  if (room.disconnectTimeout) {
    return;
  }
  if (isMatchOver(room.matchState)) {
    return;
  }
  room.disconnectPendingRole = disconnectedRole;
  room.disconnectTimeout = setTimeout(() => {
    const updatedRoom = getRoom(roomCode);
    if (!updatedRoom) {
      return;
    }
    updatedRoom.disconnectTimeout = null;
    updatedRoom.disconnectPendingRole = null;
    if (isMatchOver(updatedRoom.matchState)) {
      return;
    }
    const { hostConnected, guestConnected } = updatedRoom;
    if (hostConnected === guestConnected) {
      return;
    }
    const winnerIndex = hostConnected
      ? updatedRoom.hostPlayerIndex
      : ((updatedRoom.hostPlayerIndex === 0 ? 1 : 0) as 0 | 1);
    if (forfeitMatch(updatedRoom, winnerIndex)) {
      broadcastGameState(roomCode, updatedRoom.matchState);
    }
  }, DISCONNECT_FORFEIT_TIMEOUT_MS);
}

function removeClient(roomCode: string, client: SseClient): void {
  const clients = clientsByRoom.get(roomCode);
  if (!clients) {
    return;
  }
  const removed = clients.delete(client);
  if (removed) {
    console.log(`SSE ${client.role} disconnected: ${roomCode}`);
  }
  if (clients.size === 0) {
    clientsByRoom.delete(roomCode);
  }

  const status = updateRoomConnections(roomCode);
  const room = getRoom(roomCode);
  if (room) {
    broadcast(roomCode, "status", statusMarkup(status));

    if (client.role === "host" && !room.guestEverJoined && !status.hostConnected) {
      deleteRoom(roomCode, "host-left");
      clientsByRoom.delete(roomCode);
      return;
    }

    if (room.guestEverJoined && !isMatchOver(room.matchState)) {
      startDisconnectTimeout(roomCode, room, client.role);
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
  const viewerIndex: 0 | 1 = role === "host" ? room.hostPlayerIndex : room.hostPlayerIndex === 0 ? 1 : 0;
  let client: SseClient | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      client = {
        role,
        viewerIndex,
        controller,
        heartbeat: null,
      };

      const clients = ensureRoomClients(roomCode);
      clients.add(client);
      if (role === "host") {
        console.log(`SSE host connected: ${roomCode}`);
      } else if (role === "guest") {
        console.log(`SSE guest connected: ${roomCode}`);
      }
      clearDisconnectTimeout(room, role);

      if (role === "guest") {
        const isFirstGuest = !room.guestEverJoined;
        room.guestEverJoined = true;
        if (isFirstGuest) {
          broadcast(roomCode, "connected", "guest");
          startGame(roomCode);
          const updatedRoom = getRoom(roomCode);
          if (updatedRoom) {
            broadcastGameState(roomCode, updatedRoom.matchState);
          }
        }
      }

      const status = updateRoomConnections(roomCode);
      broadcast(roomCode, "status", statusMarkup(status));
      if (room.guestEverJoined && !isMatchOver(room.matchState)) {
        if (!status.hostConnected || !status.guestConnected) {
          const disconnectedRole: ClientRole = !status.hostConnected ? "host" : "guest";
          startDisconnectTimeout(roomCode, room, disconnectedRole);
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
