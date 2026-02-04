import { expect, test } from "@playwright/test";

// Playwright runs in Node, not Bun; guard so `bun test` doesn't treat this as a Bun test file.
const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";

if (!isBun) {
  test("host can create a room", async ({ page }) => {
    await page.goto("http://localhost:3001");

    await page.getByRole("button", { name: "Create Room" }).click();

    await expect(page).toHaveURL(/\/rooms\/[A-Z0-9]+\/lobby$/);

    const pathname = new URL(page.url()).pathname;
    const pathMatch = pathname.match(/^\/rooms\/([A-Z0-9]+)\/lobby$/);
    expect(pathMatch).not.toBeNull();
    const roomCodeFromUrl = pathMatch ? pathMatch[1] : "";

    const roomCodeLocator = page.getByLabel("Room code");
    await expect(roomCodeLocator).toBeVisible();
    const roomCodeText = await roomCodeLocator.textContent();
    const roomCodeFromPage = roomCodeText ? roomCodeText.trim().replace(/\s+/g, "") : "";
    expect(roomCodeFromPage).toBe(roomCodeFromUrl);

    await expect(page.getByText("Waiting for opponent...")).toBeVisible();
  });
}
