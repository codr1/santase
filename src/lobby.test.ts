import { describe, expect, test } from "bun:test";
import { handleRequest } from "./index";
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

describe("Lobby start flow", () => {
  test("sends status event when guest connects", async () => {
    const room = createRoom();

    const hostAbort = new AbortController();
    const hostRequest = new Request(`http://example/sse/${room.code}?hostToken=${room.hostToken}`, {
      signal: hostAbort.signal,
    });
    const hostResponse = handleSse(hostRequest, room.code);
    const hostReader = hostResponse.body?.getReader();
    if (!hostReader) {
      throw new Error("Expected host SSE stream reader");
    }
    await readEvents(hostReader, 2);

    const guestAbort = new AbortController();
    const guestRequest = new Request(`http://example/sse/${room.code}`, {
      signal: guestAbort.signal,
    });
    const guestResponse = handleSse(guestRequest, room.code);
    void guestResponse;

    const guestConnectEvents = await readEvents(hostReader, 3);
    const statusEvent = guestConnectEvents.find((event) => event.event === "status");
    expect(statusEvent?.data).toBe("<span>Opponent connected</span>");

    guestAbort.abort();
    hostAbort.abort();
    deleteRoom(room.code);
  });

  test("returns 403 when host token is missing or invalid", () => {
    const room = createRoom();

    const request = new Request(`http://example/rooms/${room.code}/start`, {
      method: "POST",
    });
    const response = handleRequest(request);

    expect(response.status).toBe(403);

    deleteRoom(room.code);
  });

  test("returns 409 when guest is not connected", () => {
    const room = createRoom();

    const request = new Request(
      `http://example/rooms/${room.code}/start?hostToken=${room.hostToken}`,
      {
        method: "POST",
      },
    );
    const response = handleRequest(request);

    expect(response.status).toBe(409);

    deleteRoom(room.code);
  });

  test("broadcasts game-start when host starts the game", async () => {
    const room = createRoom();

    const hostAbort = new AbortController();
    const hostRequest = new Request(`http://example/sse/${room.code}?hostToken=${room.hostToken}`, {
      signal: hostAbort.signal,
    });
    const hostResponse = handleSse(hostRequest, room.code);
    const hostReader = hostResponse.body?.getReader();
    if (!hostReader) {
      throw new Error("Expected host SSE stream reader");
    }
    await readEvents(hostReader, 2);

    const guestAbort = new AbortController();
    const guestRequest = new Request(`http://example/sse/${room.code}`, {
      signal: guestAbort.signal,
    });
    const guestResponse = handleSse(guestRequest, room.code);
    const guestReader = guestResponse.body?.getReader();
    if (!guestReader) {
      throw new Error("Expected guest SSE stream reader");
    }
    await readEvents(hostReader, 3);
    await readEvents(guestReader, 2);

    const startRequest = new Request(
      `http://example/rooms/${room.code}/start?hostToken=${room.hostToken}`,
      {
        method: "POST",
      },
    );
    const startResponse = handleRequest(startRequest);

    expect(startResponse.status).toBe(204);

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
