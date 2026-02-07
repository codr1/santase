import { deleteRoom, forfeitMatch, getRoom, touchRoom, type Room } from "./rooms";
import { getViewerMatchState, isMatchOver, type MatchState } from "./game";
import { ts } from "./utils/log";

const HEARTBEAT_INTERVAL_MS = 25_000;
export const DISCONNECT_FORFEIT_TIMEOUT_MS = 30_000;

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
    console.log(`[${ts()}] BROADCAST room=${roomCode} event=${event} skipped (no clients)`);
    return;
  }
  const roles = [...clients].map((c) => c.role).join(",");
  console.log(`[${ts()}] BROADCAST room=${roomCode} event=${event} clients=${clients.size} roles=[${roles}]`);
  const payload = encodeEvent(event, data);
  for (const client of clients) {
    try {
      client.controller.enqueue(payload);
    } catch (err) {
      console.log(`[${ts()}] BROADCAST enqueue error room=${roomCode} event=${event} role=${client.role}: ${err}`);
    }
  }
  touchRoom(roomCode);
}

function startGame(roomCode: string): void {
  const destination = `/rooms/${encodeURIComponent(roomCode)}/game`;
  const clients = clientsByRoom.get(roomCode);
  const clientCount = clients ? clients.size : 0;
  const roles = clients ? [...clients].map((c) => c.role).join(",") : "none";
  console.log(`[${ts()}] GAME-START room=${roomCode} destination=${destination} clients=${clientCount} roles=[${roles}]`);
  broadcast(roomCode, "game-start", destination);
}

export function broadcastGameState(
  roomCode: string,
  matchState: MatchState,
  options: { draw?: boolean } = {},
): void {
  const clients = clientsByRoom.get(roomCode);
  if (!clients || clients.size === 0) {
    console.log(`[${ts()}] BROADCAST-GAME-STATE room=${roomCode} skipped (no clients)`);
    return;
  }
  const draw = options.draw === true;
  const roles = [...clients].map((c) => c.role).join(",");
  console.log(`[${ts()}] BROADCAST-GAME-STATE room=${roomCode} clients=${clients.size} roles=[${roles}] draw=${draw}`);
  for (const client of clients) {
    const visibleState = getViewerMatchState(matchState, client.viewerIndex);
    const payload = encodeEvent("game-state", JSON.stringify({ ...visibleState, draw }));
    try {
      client.controller.enqueue(payload);
    } catch (err) {
      console.log(`[${ts()}] BROADCAST-GAME-STATE enqueue error room=${roomCode} role=${client.role}: ${err}`);
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
  return `<span data-host-connected="${status.hostConnected}" data-guest-connected="${status.guestConnected}"></span>`;
}

function clearDisconnectTimeout(room: Room, role?: ClientRole): void {
  if (role) {
    const timeout = room.disconnectTimeouts[role];
    if (!timeout) {
      return;
    }
    clearTimeout(timeout);
    delete room.disconnectTimeouts[role];
    return;
  }
  const hostTimeout = room.disconnectTimeouts.host;
  if (hostTimeout) {
    clearTimeout(hostTimeout);
  }
  const guestTimeout = room.disconnectTimeouts.guest;
  if (guestTimeout) {
    clearTimeout(guestTimeout);
  }
  room.disconnectTimeouts = {};
}

export function clearRoomDisconnectTimeouts(room: Room): void {
  clearDisconnectTimeout(room, "host");
  clearDisconnectTimeout(room, "guest");
}

function startDisconnectTimeout(
  roomCode: string,
  room: Room,
  disconnectedRole: ClientRole,
): void {
  if (room.disconnectTimeouts[disconnectedRole]) {
    console.log(`[${ts()}] DISCONNECT-TIMEOUT room=${roomCode} role=${disconnectedRole} already running, skipping`);
    return;
  }
  if (isMatchOver(room.matchState)) {
    console.log(`[${ts()}] DISCONNECT-TIMEOUT room=${roomCode} role=${disconnectedRole} match already over, skipping`);
    return;
  }
  console.log(`[${ts()}] DISCONNECT-TIMEOUT room=${roomCode} role=${disconnectedRole} starting ${DISCONNECT_FORFEIT_TIMEOUT_MS}ms timer`);
  room.disconnectTimeouts[disconnectedRole] = setTimeout(() => {
    console.log(`[${ts()}] DISCONNECT-TIMEOUT room=${roomCode} role=${disconnectedRole} timer fired`);
    const updatedRoom = getRoom(roomCode);
    if (!updatedRoom) {
      console.log(`[${ts()}] DISCONNECT-TIMEOUT room=${roomCode} role=${disconnectedRole} room not found`);
      return;
    }
    delete updatedRoom.disconnectTimeouts[disconnectedRole];
    if (isMatchOver(updatedRoom.matchState)) {
      console.log(`[${ts()}] DISCONNECT-TIMEOUT room=${roomCode} role=${disconnectedRole} match already over`);
      return;
    }
    if (updatedRoom.draw) {
      console.log(`[${ts()}] DISCONNECT-TIMEOUT room=${roomCode} role=${disconnectedRole} already draw`);
      return;
    }
    const { hostConnected, guestConnected } = updatedRoom;
    console.log(`[${ts()}] DISCONNECT-TIMEOUT room=${roomCode} role=${disconnectedRole} hostConn=${hostConnected} guestConn=${guestConnected}`);
    if (!hostConnected && !guestConnected) {
      updatedRoom.draw = true;
      updatedRoom.forfeit = false;
      updatedRoom.hostReady = false;
      updatedRoom.guestReady = false;
      console.log(`[${ts()}] MATCH-DRAW room=${roomCode} (dual disconnect)`);
      broadcastGameState(roomCode, updatedRoom.matchState, { draw: true });
      return;
    }
    if (hostConnected === guestConnected) {
      console.log(`[${ts()}] DISCONNECT-TIMEOUT room=${roomCode} role=${disconnectedRole} both same state, no action`);
      return;
    }
    const winnerIndex = hostConnected
      ? updatedRoom.hostPlayerIndex
      : ((updatedRoom.hostPlayerIndex === 0 ? 1 : 0) as 0 | 1);
    console.log(`[${ts()}] FORFEIT room=${roomCode} winner=${winnerIndex} (${hostConnected ? "host" : "guest"} connected)`);
    if (forfeitMatch(updatedRoom, winnerIndex)) {
      broadcastGameState(roomCode, updatedRoom.matchState);
    }
  }, DISCONNECT_FORFEIT_TIMEOUT_MS);
}

function removeClient(roomCode: string, client: SseClient): void {
  const clients = clientsByRoom.get(roomCode);
  if (!clients) {
    console.log(`[${ts()}] REMOVE-CLIENT room=${roomCode} role=${client.role} no client set found`);
    return;
  }
  const removed = clients.delete(client);
  if (removed) {
    console.log(`[${ts()}] SSE-DISCONNECT room=${roomCode} role=${client.role} remaining=${clients.size}`);
  }
  if (clients.size === 0) {
    clientsByRoom.delete(roomCode);
  }

  const status = updateRoomConnections(roomCode);
  const room = getRoom(roomCode);
  if (room) {
    console.log(`[${ts()}] REMOVE-CLIENT room=${roomCode} role=${client.role} hostConn=${status.hostConnected} guestConn=${status.guestConnected} guestEverJoined=${room.guestEverJoined}`);
    broadcast(roomCode, "status", statusMarkup(status));

    if (client.role === "host" && !room.guestEverJoined && !status.hostConnected) {
      console.log(`[${ts()}] HOST-LEFT-BEFORE-GUEST room=${roomCode} deleting room`);
      deleteRoom(roomCode, "host-left");
      clientsByRoom.delete(roomCode);
      return;
    }

    if (room.guestEverJoined && !isMatchOver(room.matchState)) {
      console.log(`[${ts()}] DISCONNECT-TIMER-START room=${roomCode} role=${client.role}`);
      startDisconnectTimeout(roomCode, room, client.role);
    }
  } else {
    console.log(`[${ts()}] REMOVE-CLIENT room=${roomCode} role=${client.role} room not found (already deleted?)`);
  }
}

export function handleSse(request: Request, roomCode: string): Response {
  const reqUrl = new URL(request.url);
  const hasToken = reqUrl.searchParams.has("hostToken");
  console.log(`[${ts()}] SSE-REQUEST room=${roomCode} hasHostToken=${hasToken}`);
  const lookup = getRoom(roomCode, { includeMetadata: true });
  if (lookup.status !== "active") {
    console.log(`[${ts()}] SSE-REQUEST room=${roomCode} rejected: status=${lookup.status}${lookup.status === "expired" ? ` reason=${lookup.reason}` : ""}`);
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
  console.log(`[${ts()}] SSE-RESOLVE room=${roomCode} role=${role} viewerIndex=${viewerIndex} hostPlayerIndex=${room.hostPlayerIndex} guestEverJoined=${room.guestEverJoined}`);

  if (room.draw) {
    console.log(`[${ts()}] SSE-DRAW room=${roomCode} role=${role} returning draw state`);
    const visibleState = getViewerMatchState(room.matchState, viewerIndex);
    const payload = encodeEvent("game-state", JSON.stringify({ ...visibleState, draw: true }));
    touchRoom(roomCode);
    return new Response(payload, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  }
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
      console.log(`[${ts()}] SSE-CONNECTED room=${roomCode} role=${role} viewerIndex=${viewerIndex} totalClients=${clients.size} allRoles=[${[...clients].map((c) => c.role).join(",")}]`);
      clearDisconnectTimeout(room, role);

      if (role === "guest") {
        const isFirstGuest = !room.guestEverJoined;
        console.log(`[${ts()}] SSE-GUEST-JOIN room=${roomCode} isFirstGuest=${isFirstGuest}`);
        room.guestEverJoined = true;
        if (isFirstGuest) {
          console.log(`[${ts()}] SSE-FIRST-GUEST room=${roomCode} broadcasting connected + game-start`);
          broadcast(roomCode, "connected", "guest");
          startGame(roomCode);
          const updatedRoom = getRoom(roomCode);
          if (updatedRoom) {
            broadcastGameState(roomCode, updatedRoom.matchState);
          } else {
            console.log(`[${ts()}] SSE-FIRST-GUEST room=${roomCode} WARNING: room disappeared after startGame`);
          }
        }
      }

      const status = updateRoomConnections(roomCode);
      console.log(`[${ts()}] SSE-STATUS room=${roomCode} hostConn=${status.hostConnected} guestConn=${status.guestConnected}`);
      broadcast(roomCode, "status", statusMarkup(status));
      if (room.guestEverJoined && !isMatchOver(room.matchState)) {
        if (!status.hostConnected || !status.guestConnected) {
          const disconnectedRole: ClientRole = !status.hostConnected ? "host" : "guest";
          console.log(`[${ts()}] SSE-MISSING-PLAYER room=${roomCode} disconnectedRole=${disconnectedRole} starting timeout`);
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
        console.log(`[${ts()}] SSE-ABORT room=${roomCode} role=${role}`);
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
      console.log(`[${ts()}] SSE-CANCEL room=${roomCode} role=${role}`);
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
