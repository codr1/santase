import { initializeMatch, type MatchState } from "./game";

const ROOM_CODE_MIN_LENGTH = 4;
const ROOM_CODE_MAX_LENGTH = 6;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ234567890";
const ROOM_INACTIVITY_MS = 10 * 60 * 1000;
const ROOM_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const ROOM_CODE_MAX_ATTEMPTS = 20;

export type Room = {
  code: string;
  hostToken: string;
  hostConnected: boolean;
  guestConnected: boolean;
  guestEverJoined: boolean;
  lastActivity: number;
  createdAt: number;
  matchState: MatchState;
};

const rooms = new Map<string, Room>();

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
      const room: Room = {
        code,
        hostToken: generateRoomToken(),
        hostConnected: false,
        guestConnected: false,
        guestEverJoined: false,
        lastActivity: now,
        createdAt: now,
        matchState: initializeMatch(),
      };
      rooms.set(code, room);
      return room;
    }
  }

  throw new Error("Unable to generate unique room code");
}

function generateRoomToken(): string {
  return crypto.randomUUID();
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function getRoomsCount(): number {
  return rooms.size;
}

export function deleteRoom(code: string): boolean {
  return rooms.delete(code);
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
      rooms.delete(code);
      removed += 1;
    }
  }
  return removed;
}

export function startRoomCleanup(): void {
  setInterval(() => {
    cleanupRooms();
  }, ROOM_CLEANUP_INTERVAL_MS);
}
