import { expect, test, type Page } from "@playwright/test";

// Playwright runs in Node, not Bun; guard so `bun test` doesn't treat this as a Bun test file.
const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";

if (!isBun) {
  const baseUrl = "http://localhost:3001";

  const createRoom = async (page: Page): Promise<string> => {
    await page.goto(baseUrl);
    await page.getByRole("button", { name: "Create Room" }).click();
    await expect(page).toHaveURL(/\/rooms\/[A-Z0-9]+\/lobby$/);

    const pathname = new URL(page.url()).pathname;
    const pathMatch = pathname.match(/^\/rooms\/([A-Z0-9]+)\/lobby$/);
    expect(pathMatch).not.toBeNull();
    return pathMatch ? pathMatch[1] : "";
  };

  const assertRoomCodeShown = async (page: Page, roomCode: string): Promise<void> => {
    const roomCodeLocator = page.getByLabel(/Room code/i);
    await expect(roomCodeLocator).toBeVisible();
    const roomCodeText = await roomCodeLocator.textContent();
    const roomCodeFromPage = roomCodeText ? roomCodeText.trim().replace(/\s+/g, "") : "";
    expect(roomCodeFromPage).toBe(roomCode);
  };

  const joinRoom = async (page: Page, roomCode: string): Promise<void> => {
    await page.goto(`${baseUrl}/join`);
    await page.getByLabel(/Room Code/i).fill(roomCode);
    await page.getByRole("button", { name: "Join Room" }).click();
    await expect(page).toHaveURL(new RegExp(`/rooms/${roomCode}$`));
  };

  test("host can create a room", async ({ page }) => {
    const roomCodeFromUrl = await createRoom(page);
    await assertRoomCodeShown(page, roomCodeFromUrl);

    await expect(page.getByText("Waiting for opponent...")).toBeVisible();
  });

  test("guest can join room", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    try {
      const hostPage = await hostContext.newPage();
      const roomCode = await createRoom(hostPage);

      const guestPage = await guestContext.newPage();
      await joinRoom(guestPage, roomCode);

      await expect(guestPage.getByRole("heading", { name: "Joined room" })).toBeVisible();
      await assertRoomCodeShown(guestPage, roomCode);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test("game auto-starts when guest joins via SSE", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    try {
      const hostPage = await hostContext.newPage();
      const roomCode = await createRoom(hostPage);

      const guestPage = await guestContext.newPage();

      // Wait for both pages to navigate to game after guest joins
      await Promise.all([
        hostPage.waitForURL(new RegExp(`/rooms/${roomCode}/game$`)),
        guestPage.waitForURL(new RegExp(`/rooms/${roomCode}/game$`)),
        joinRoom(guestPage, roomCode),
      ]);

      // Verify both are on the game page
      await expect(hostPage.getByRole("heading", { name: "Game Starting" })).toBeVisible();
      await expect(guestPage.getByRole("heading", { name: "Game Starting" })).toBeVisible();
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
}
