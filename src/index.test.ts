import { describe, expect, test } from "bun:test";
import { handleRequest, resolvePort } from "./index";
import { deleteRoom } from "./rooms";

describe("resolvePort", () => {
  test("defaults to 3000 when env var is missing", () => {
    expect(resolvePort(undefined)).toBe(3000);
  });

  test("parses a numeric port", () => {
    expect(resolvePort("8080")).toBe(8080);
  });

  test("falls back to 3000 on invalid input", () => {
    expect(resolvePort("not-a-port")).toBe(3000);
  });
});

describe("join flow", () => {
  test("creates then joins a room with normalized code", () => {
    let roomCode: string | undefined;

    for (let attempt = 0; attempt < 200; attempt += 1) {
      const createResponse = handleRequest(
        new Request("http://example/rooms", { method: "POST" }),
      );
      expect(createResponse.status).toBe(303);

      const location = createResponse.headers.get("location");
      if (!location) {
        throw new Error("Expected room creation redirect location");
      }
      const match = location.match(/^\/rooms\/([^/]+)\/lobby$/);
      if (!match) {
        throw new Error(`Unexpected room creation redirect: ${location}`);
      }

      const code = decodeURIComponent(match[1]);
      if (code.includes("0") && /[A-Z]/.test(code)) {
        roomCode = code;
        break;
      }

      deleteRoom(code);
    }

    if (!roomCode) {
      throw new Error("Unable to create room code containing 0 for test");
    }

    try {
      const userInput = `  ${roomCode.toLowerCase().replaceAll("0", "o")}  `;
      const joinResponse = handleRequest(
        new Request(`http://example/rooms?code=${encodeURIComponent(userInput)}`),
      );

      expect(joinResponse.status).toBe(303);
      expect(joinResponse.headers.get("location")).toBe(
        `/rooms/${encodeURIComponent(roomCode)}`,
      );
    } finally {
      deleteRoom(roomCode);
    }
  });
});
