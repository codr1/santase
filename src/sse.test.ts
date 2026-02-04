import { describe, expect, test } from "bun:test";
import { createRoom, deleteRoom } from "./rooms";
import { handleSse } from "./sse";

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

    const initialEvents = await readEvents(hostReader, 1);
    const initialStatus = initialEvents.find((event) => event.event === "status");
    expect(initialStatus?.data).toBe("<span>Waiting for opponent...</span>");

    const guestAbort = new AbortController();
    const guestRequest = new Request(`http://example/rooms/${room.code}`, {
      signal: guestAbort.signal,
    });
    const guestResponse = handleSse(guestRequest, room.code);
    void guestResponse;

    const guestConnectEvents = await readEvents(hostReader, 4);
    const connectedEvent = guestConnectEvents.find((event) => event.event === "connected");
    const gameStartAfterGuest = guestConnectEvents.find((event) => event.event === "game-start");
    const gameStateAfterGuest = guestConnectEvents.find((event) => event.event === "game-state");
    const statusAfterGuest = guestConnectEvents.find((event) => event.event === "status");
    expect(connectedEvent?.data).toBe("guest");
    expect(gameStartAfterGuest?.data).toBe(`/rooms/${room.code}/game`);
    expect(gameStateAfterGuest?.data).toBe(JSON.stringify(room.matchState));
    expect(statusAfterGuest?.data).toBe("<span>Opponent connected</span>");

    guestAbort.abort();
    const guestDisconnectEvents = await readEvents(hostReader, 1);
    const statusAfterGuestLeft = guestDisconnectEvents.find((event) => event.event === "status");
    expect(statusAfterGuestLeft?.data).toBe("<span>Waiting for opponent...</span>");

    hostAbort.abort();
    deleteRoom(room.code);
  });

});
