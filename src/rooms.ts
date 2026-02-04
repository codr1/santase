import { initializeMatch, type MatchState } from "./game";

const ROOM_CODE_MIN_LENGTH = 4;
const ROOM_CODE_MAX_LENGTH = 6;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ234567890";
const ROOM_INACTIVITY_MS = 10 * 60 * 1000;
const ROOM_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const ROOM_CODE_MAX_ATTEMPTS = 20;
const ROOM_EXPIRED_RETENTION_MS = 60 * 60 * 1000;

export type Room = {
  code: string;
  hostToken: string;
  hostPlayerIndex: 0 | 1;
  hostConnected: boolean;
  guestConnected: boolean;
  guestEverJoined: boolean;
  lastActivity: number;
  createdAt: number;
  matchState: MatchState;
};

export type RoomDeleteReason = "expired" | "host-left" | "manual";

export type RoomLookupResult =
  | { status: "active"; room: Room }
  | { status: "expired"; expiredAt: number; reason: RoomDeleteReason }
  | { status: "missing" };

const rooms = new Map<string, Room>();
const expiredRooms = new Map<string, { expiredAt: number; reason: RoomDeleteReason }>();

function randomIntInclusive(min: number, max: number): number {
  const range = max - min + 1;
  const values = crypto.getRandomValues(new Uint32Array(1));
  return min + (values[0] % range);
}

export function generateRoomCode(): string {
  const length = randomIntInclusive(ROOM_CODE_MIN_LENGTH, ROOM_CODE_MAX_LENGTH);
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = "";

  for (const value of bytes) {
    result += ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length];
  }

  return result;
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase().replaceAll("O", "0");
}

export function createRoom(): Room {
  for (let attempt = 0; attempt < ROOM_CODE_MAX_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode();
    if (!rooms.has(code)) {
      const now = Date.now();
      const matchState = initializeMatch();
      const room: Room = {
        code,
        hostToken: generateRoomToken(),
        hostPlayerIndex: matchState.dealerIndex,
        hostConnected: false,
        guestConnected: false,
        guestEverJoined: false,
        lastActivity: now,
        createdAt: now,
        matchState,
      };
      rooms.set(code, room);
      expiredRooms.delete(code);
      console.log(`Room created: ${code}`);
      return room;
    }
  }

  throw new Error("Unable to generate unique room code");
}

function generateRoomToken(): string {
  return crypto.randomUUID();
}

export function getRoom(code: string): Room | undefined;

export function getRoom(
  code: string,
  options: { includeMetadata: true },
): RoomLookupResult;

export function getRoom(
  code: string,
  options?: { includeMetadata?: boolean },
): Room | RoomLookupResult | undefined {
  const room = rooms.get(code);
  if (options?.includeMetadata) {
    if (room) {
      return { status: "active", room };
    }
    const expired = expiredRooms.get(code);
    if (expired) {
      return { status: "expired", expiredAt: expired.expiredAt, reason: expired.reason };
    }
    return { status: "missing" };
  }
  return room;
}

export function getRoomsCount(): number {
  return rooms.size;
}

export function deleteRoom(code: string, reason: RoomDeleteReason = "manual"): boolean {
  return removeRoom(code, reason);
}

export function touchRoom(code: string): boolean {
  const room = rooms.get(code);
  if (!room) {
    return false;
  }
  room.lastActivity = Date.now();
  return true;
}

export function cleanupRooms(now = Date.now()): number {
  let removed = 0;
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActivity > ROOM_INACTIVITY_MS) {
      removeRoom(code, "expired", now);
      removed += 1;
    }
  }
  pruneExpiredRooms(now);
  return removed;
}

export function startRoomCleanup(): void {
  setInterval(() => {
    cleanupRooms();
  }, ROOM_CLEANUP_INTERVAL_MS);
}

function removeRoom(code: string, reason: RoomDeleteReason, now = Date.now()): boolean {
  const removed = rooms.delete(code);
  if (!removed) {
    return false;
  }
  expiredRooms.set(code, { expiredAt: now, reason });
  console.log(`Room deleted (${reason}): ${code}`);
  return true;
}

function pruneExpiredRooms(now: number): void {
  for (const [code, entry] of expiredRooms.entries()) {
    if (now - entry.expiredAt > ROOM_EXPIRED_RETENTION_MS) {
      expiredRooms.delete(code);
    }
  }
}
