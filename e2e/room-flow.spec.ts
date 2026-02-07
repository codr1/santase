// Playwright runs in Node, not Bun; guard so `bun test` doesn't load Playwright.
const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";

if (!isBun) {
  const { expect, test } = await import("@playwright/test");
  const { createRoom, joinRoom } = await import("./helpers");

  const assertRoomCodeShown = async (page: any, roomCode: string): Promise<void> => {
    const roomCodeLocator = page.getByLabel(/Room code/i);
    await expect(roomCodeLocator).toBeVisible();
    const roomCodeText = await roomCodeLocator.textContent();
    const roomCodeFromPage = roomCodeText ? roomCodeText.trim().replace(/\s+/g, "") : "";
    expect(roomCodeFromPage).toBe(roomCode);
  };

  test("host can create a room", async ({ page }: { page: any }) => {
    const roomCodeFromUrl = await createRoom(page);
    await assertRoomCodeShown(page, roomCodeFromUrl);

    await expect(page.getByText("Waiting for opponent...")).toBeVisible();
  });

  test("guest can join room", async ({ browser }: { browser: any }) => {
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

  test("SSE updates connection status", async ({ browser }: { browser: any }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    try {
      const hostPage = await hostContext.newPage();
      const roomCode = await createRoom(hostPage);

      const guestPage = await guestContext.newPage();

      // Wait for both pages to navigate to game after guest joins
      await joinRoom(guestPage, roomCode);

      const hostStatus = hostPage.locator("#lobby-status");
      const guestStatus = guestPage.locator("#lobby-status");

      await expect(hostStatus).toContainText("Opponent connected");
      await expect(guestStatus).toContainText("Opponent connected");
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test("both players redirect to game on guest join", async ({ browser }: { browser: any }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    try {
      const hostPage = await hostContext.newPage();
      const roomCode = await createRoom(hostPage);

      const guestPage = await guestContext.newPage();
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
