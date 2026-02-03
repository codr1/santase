import { describe, expect, test } from "bun:test";
import { createRoom, deleteRoom } from "./rooms";
import { handleSse, startGame } from "./sse";

type SseEvent = {
  event: string;
  data: string;
};

const decoder = new TextDecoder();

function parseEvents(buffer: string): { events: SseEvent[]; remainder: string } {
  const blocks = buffer.split("\n\n");
  const remainder = blocks.pop() ?? "";
  const events: SseEvent[] = [];

  for (const block of blocks) {
    if (!block || block.startsWith(":")) {
      continue;
    }
    let eventName = "";
    const dataLines: string[] = [];

    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) {
        eventName = line.slice("event: ".length);
      } else if (line.startsWith("data: ")) {
        dataLines.push(line.slice("data: ".length));
      }
    }

    if (eventName) {
      events.push({ event: eventName, data: dataLines.join("\n") });
    }
  }

  return { events, remainder };
}

async function readEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  count: number,
  timeoutMs = 1000,
): Promise<SseEvent[]> {
  const deadline = Date.now() + timeoutMs;
  const events: SseEvent[] = [];
  let buffer = "";

  while (events.length < count) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${count} SSE events`);
    }

    const { value, done } = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Timed out reading SSE data")), timeoutMs);
      }),
    ]);

    if (done || !value) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const parsed = parseEvents(buffer);
    buffer = parsed.remainder;
    events.push(...parsed.events);
  }

  return events.slice(0, count);
}

describe("SSE status broadcasting", () => {
  test("sends status on connect and disconnect for host and guest", async () => {
    const room = createRoom();

    const hostAbort = new AbortController();
    const hostRequest = new Request(`http://example/rooms/${room.code}?hostToken=${room.hostToken}`, {
      signal: hostAbort.signal,
    });
    const hostResponse = handleSse(hostRequest, room.code);
    const hostReader = hostResponse.body?.getReader();
    if (!hostReader) {
      throw new Error("Expected host SSE stream reader");
    }

    const initialEvents = await readEvents(hostReader, 2);
    const initialStatus = initialEvents.find((event) => event.event === "status");
    const initialStartGame = initialEvents.find((event) => event.event === "start-game");
    expect(initialStatus?.data).toBe("Waiting for opponent...");
    expect(initialStartGame?.data).toBe("");

    const guestAbort = new AbortController();
    const guestRequest = new Request(`http://example/rooms/${room.code}`, {
      signal: guestAbort.signal,
    });
    const guestResponse = handleSse(guestRequest, room.code);
    void guestResponse;

    const guestConnectEvents = await readEvents(hostReader, 3);
    const connectedEvent = guestConnectEvents.find((event) => event.event === "connected");
    const statusAfterGuest = guestConnectEvents.find((event) => event.event === "status");
    const startGameAfterGuest = guestConnectEvents.find((event) => event.event === "start-game");
    expect(connectedEvent?.data).toBe("guest");
    expect(statusAfterGuest?.data).toBe("Opponent connected");
    expect(startGameAfterGuest?.data).toBe(
      `<button type="button" hx-post="/rooms/${room.code}/start?hostToken=${room.hostToken}" hx-swap="none" aria-label="Start game">Start Game</button>`,
    );

    guestAbort.abort();
    const guestDisconnectEvents = await readEvents(hostReader, 3);
    const disconnectedEvent = guestDisconnectEvents.find((event) => event.event === "disconnected");
    const statusAfterGuestLeft = guestDisconnectEvents.find((event) => event.event === "status");
    const startGameAfterGuestLeft = guestDisconnectEvents.find((event) => event.event === "start-game");
    expect(disconnectedEvent?.data).toBe("guest");
    expect(statusAfterGuestLeft?.data).toBe("Waiting for opponent...");
    expect(startGameAfterGuestLeft?.data).toBe("");

    hostAbort.abort();
    deleteRoom(room.code);
  });

  test("broadcasts game-start to host and guest", async () => {
    const room = createRoom();

    const hostAbort = new AbortController();
    const hostRequest = new Request(`http://example/rooms/${room.code}?hostToken=${room.hostToken}`, {
      signal: hostAbort.signal,
    });
    const hostResponse = handleSse(hostRequest, room.code);
    const hostReader = hostResponse.body?.getReader();
    if (!hostReader) {
      throw new Error("Expected host SSE stream reader");
    }
    await readEvents(hostReader, 2);

    const guestAbort = new AbortController();
    const guestRequest = new Request(`http://example/rooms/${room.code}`, {
      signal: guestAbort.signal,
    });
    const guestResponse = handleSse(guestRequest, room.code);
    const guestReader = guestResponse.body?.getReader();
    if (!guestReader) {
      throw new Error("Expected guest SSE stream reader");
    }
    await readEvents(hostReader, 3);
    await readEvents(guestReader, 2);

    startGame(room.code);

    const hostGameStart = await readEvents(hostReader, 1);
    const guestGameStart = await readEvents(guestReader, 1);
    expect(hostGameStart[0]?.event).toBe("game-start");
    expect(guestGameStart[0]?.event).toBe("game-start");
    expect(hostGameStart[0]?.data).toBe(`/rooms/${room.code}/game`);
    expect(guestGameStart[0]?.data).toBe(`/rooms/${room.code}/game`);

    hostAbort.abort();
    guestAbort.abort();
    deleteRoom(room.code);
  });
});
