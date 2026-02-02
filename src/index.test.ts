import { describe, expect, test } from "bun:test";
import { resolvePort } from "./index";

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
