import { describe, expect, test } from "bun:test";
import { getViewerMatchState } from "./game";
import { createRoom, deleteRoom } from "./rooms";
import { DISCONNECT_FORFEIT_TIMEOUT_MS, handleSse } from "./sse";

type SseEvent = {
  event: string;
  data: string;
};

const decoder = new TextDecoder();

type CapturedDisconnectTimer = {
  callback: () => void;
  cleared: boolean;
};

function interceptDisconnectTimeouts(): {
  fireNext: () => boolean;
  restore: () => void;
} {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const captured: CapturedDisconnectTimer[] = [];

  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    if (
      timeout === DISCONNECT_FORFEIT_TIMEOUT_MS &&
      typeof handler === "function" &&
      args.length === 0
    ) {
      const timer: CapturedDisconnectTimer = {
        callback: handler as () => void,
        cleared: false,
      };
      captured.push(timer);
      return timer as unknown as ReturnType<typeof setTimeout>;
    }

    return originalSetTimeout(handler, timeout, ...args);
  }) as typeof setTimeout;

  globalThis.clearTimeout = ((id?: ReturnType<typeof setTimeout>) => {
    const capturedTimer = id as unknown as CapturedDisconnectTimer;
    if (captured.includes(capturedTimer)) {
      capturedTimer.cleared = true;
      return;
    }
    originalClearTimeout(id);
  }) as typeof clearTimeout;

  return {
    fireNext: () => {
      const timer = captured.find((entry) => !entry.cleared);
      if (!timer) {
        return false;
      }
      timer.cleared = true;
      timer.callback();
      return true;
    },
    restore: () => {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    },
  };
}

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
    expect(initialStatus?.data).toBe(
      '<span data-host-connected="true" data-guest-connected="false"></span>',
    );

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
    expect(gameStateAfterGuest?.data).toBe(
      JSON.stringify({ ...getViewerMatchState(room.matchState, room.hostPlayerIndex), draw: false }),
    );
    expect(statusAfterGuest?.data).toBe(
      '<span data-host-connected="true" data-guest-connected="true"></span>',
    );

    guestAbort.abort();
    const guestDisconnectEvents = await readEvents(hostReader, 1);
    const statusAfterGuestLeft = guestDisconnectEvents.find((event) => event.event === "status");
    expect(statusAfterGuestLeft?.data).toBe(
      '<span data-host-connected="true" data-guest-connected="false"></span>',
    );

    hostAbort.abort();
    deleteRoom(room.code);
  });

  test("handles sequential dual-disconnect and preserves remaining role timeout", async () => {
    const timeoutControl = interceptDisconnectTimeouts();
    const room = createRoom();
    room.hostPlayerIndex = 0;
    const initialScores = [...room.matchState.matchScores] as [number, number];

    const hostAbort = new AbortController();
    const guestAbort = new AbortController();
    const reconnectHostAbort = new AbortController();

    try {
      const hostResponse = handleSse(
        new Request(`http://example/rooms/${room.code}?hostToken=${room.hostToken}`, {
          signal: hostAbort.signal,
        }),
        room.code,
      );
      const hostReader = hostResponse.body?.getReader();
      if (!hostReader) {
        throw new Error("Expected host SSE stream reader");
      }
      await readEvents(hostReader, 1);

      handleSse(
        new Request(`http://example/rooms/${room.code}`, {
          signal: guestAbort.signal,
        }),
        room.code,
      );
      await readEvents(hostReader, 4);

      hostAbort.abort();
      guestAbort.abort();

      const reconnectResponse = handleSse(
        new Request(`http://example/rooms/${room.code}?hostToken=${room.hostToken}`, {
          signal: reconnectHostAbort.signal,
        }),
        room.code,
      );
      const reconnectReader = reconnectResponse.body?.getReader();
      if (!reconnectReader) {
        throw new Error("Expected reconnect host SSE stream reader");
      }
      const reconnectEvents = await readEvents(reconnectReader, 1);
      const reconnectStatus = reconnectEvents.find((event) => event.event === "status");
      expect(reconnectStatus?.data).toContain('data-host-connected="true"');
      expect(reconnectStatus?.data).toContain('data-guest-connected="false"');

      expect(timeoutControl.fireNext()).toBe(true);

      const forfeitEvents = await readEvents(reconnectReader, 1);
      const gameStateEvent = forfeitEvents.find((event) => event.event === "game-state");
      expect(gameStateEvent).toBeDefined();
      const matchState = JSON.parse(gameStateEvent!.data) as {
        matchScores: [number, number];
      };
      expect(matchState.matchScores).toEqual([11, initialScores[1]]);
      expect(room.forfeit).toBe(true);
      expect(room.draw).toBe(false);
    } finally {
      reconnectHostAbort.abort();
      hostAbort.abort();
      guestAbort.abort();
      timeoutControl.restore();
      deleteRoom(room.code);
    }
  });

  test("declares draw when both disconnect and timeout expires", async () => {
    const timeoutControl = interceptDisconnectTimeouts();
    const room = createRoom();
    const initialScores = [...room.matchState.matchScores] as [number, number];

    const hostAbort = new AbortController();
    const guestAbort = new AbortController();

    try {
      const hostResponse = handleSse(
        new Request(`http://example/rooms/${room.code}?hostToken=${room.hostToken}`, {
          signal: hostAbort.signal,
        }),
        room.code,
      );
      const hostReader = hostResponse.body?.getReader();
      if (!hostReader) {
        throw new Error("Expected host SSE stream reader");
      }
      await readEvents(hostReader, 1);

      handleSse(
        new Request(`http://example/rooms/${room.code}`, {
          signal: guestAbort.signal,
        }),
        room.code,
      );
      await readEvents(hostReader, 4);

      hostAbort.abort();
      guestAbort.abort();

      // No SSE clients are connected at this point, so draw broadcast is a no-op.
      expect(timeoutControl.fireNext()).toBe(true);
      expect(room.draw).toBe(true);
      expect(room.forfeit).toBe(false);
      expect(room.matchState.matchScores).toEqual(initialScores);

      // The second pending timeout should no-op after draw has been declared.
      expect(timeoutControl.fireNext()).toBe(true);
      expect(room.draw).toBe(true);
      expect(room.matchState.matchScores).toEqual(initialScores);
    } finally {
      hostAbort.abort();
      guestAbort.abort();
      timeoutControl.restore();
      deleteRoom(room.code);
    }
  });

  test("sends draw game-state when reconnecting after a draw", async () => {
    const timeoutControl = interceptDisconnectTimeouts();
    const room = createRoom();
    const hostAbort = new AbortController();
    const guestAbort = new AbortController();
    const reconnectHostAbort = new AbortController();

    try {
      const hostResponse = handleSse(
        new Request(`http://example/rooms/${room.code}?hostToken=${room.hostToken}`, {
          signal: hostAbort.signal,
        }),
        room.code,
      );
      const hostReader = hostResponse.body?.getReader();
      if (!hostReader) {
        throw new Error("Expected host SSE stream reader");
      }
      await readEvents(hostReader, 1);

      handleSse(
        new Request(`http://example/rooms/${room.code}`, {
          signal: guestAbort.signal,
        }),
        room.code,
      );
      await readEvents(hostReader, 4);

      hostAbort.abort();
      guestAbort.abort();
      expect(timeoutControl.fireNext()).toBe(true);
      expect(room.draw).toBe(true);

      const reconnectResponse = handleSse(
        new Request(`http://example/rooms/${room.code}?hostToken=${room.hostToken}`, {
          signal: reconnectHostAbort.signal,
        }),
        room.code,
      );
      const reconnectReader = reconnectResponse.body?.getReader();
      if (!reconnectReader) {
        throw new Error("Expected reconnect host SSE stream reader");
      }
      const reconnectEvents = await readEvents(reconnectReader, 1);
      const gameStateEvent = reconnectEvents.find((event) => event.event === "game-state");
      expect(gameStateEvent).toBeDefined();
      const payload = JSON.parse(gameStateEvent!.data) as { draw?: boolean };
      expect(payload.draw).toBe(true);
    } finally {
      reconnectHostAbort.abort();
      hostAbort.abort();
      guestAbort.abort();
      timeoutControl.restore();
      deleteRoom(room.code);
    }
  });

});
